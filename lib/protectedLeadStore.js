import {
  BlobPreconditionFailedError,
  del as deleteBlob,
  get as getBlob,
  list as listBlobs,
  put as putBlob
} from '@vercel/blob';
import { createHash, randomUUID } from 'node:crypto';
import { protectedIntakeCommand } from './journey/intakeStore.js';
import { getRequestHeader } from './http/cors.js';

const BLOB_ROOT = 'protected-leads/';
const RATE_LIMIT_ROOT = 'protected-lead-rate-limits/';

const defaultBlobClient = {
  del: deleteBlob,
  get: getBlob,
  list: listBlobs,
  put: putBlob
};

function usesBlob() {
  const kvConfigured = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  return !kvConfigured && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function isExistingBlobError(error) {
  return error instanceof BlobPreconditionFailedError
    || error?.name === 'BlobPreconditionFailedError'
    || (error?.name === 'Error' && String(error?.message || '').startsWith('Vercel Blob: This blob already exists'));
}

function pathnameForKey(key) {
  return `${BLOB_ROOT}${key.split(':').filter(Boolean).join('/')}.enc`;
}

function pathnameForPrefix(prefix) {
  return `${BLOB_ROOT}${prefix.split(':').filter(Boolean).join('/')}/`;
}

function encodeCursor(cursor) {
  return cursor ? `b.${Buffer.from(cursor, 'utf8').toString('base64url')}` : '0';
}

function decodeCursor(cursor) {
  if (cursor === '0') return undefined;
  if (typeof cursor !== 'string' || !/^b\.[A-Za-z0-9_-]{1,684}$/.test(cursor)) {
    throw Object.assign(new Error('Invalid cursor.'), { code: 'invalid_cursor', statusCode: 400 });
  }
  return Buffer.from(cursor.slice(2), 'base64url').toString('utf8');
}

async function blobText(pathname, blobClient) {
  const result = await blobClient.get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).text();
}

export async function createProtectedLead(key, encryptedValue, blobClient = defaultBlobClient) {
  if (!usesBlob()) {
    return protectedIntakeCommand(['SET', key, encryptedValue, 'EX', 90 * 24 * 60 * 60, 'NX']);
  }
  try {
    await blobClient.put(pathnameForKey(key), encryptedValue, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/octet-stream'
    });
    return 'OK';
  } catch (error) {
    if (isExistingBlobError(error)) return null;
    throw error;
  }
}

export async function getProtectedLead(key, blobClient = defaultBlobClient) {
  if (!usesBlob()) return protectedIntakeCommand(['GET', key]);
  return blobText(pathnameForKey(key), blobClient);
}

export async function listProtectedLeads(prefix, cursor = '0', blobClient = defaultBlobClient) {
  if (!usesBlob()) {
    if (!/^\d{1,20}$/.test(cursor)) throw Object.assign(new Error('Invalid cursor.'), { code: 'invalid_cursor', statusCode: 400 });
    const result = await protectedIntakeCommand(['SCAN', cursor, 'MATCH', `${prefix}*`, 'COUNT', 50]);
    if (!Array.isArray(result) || result.length !== 2 || !Array.isArray(result[1])) throw new Error('Requests unavailable.');
    const keys = result[1].filter((key) => typeof key === 'string' && key.startsWith(prefix));
    const values = keys.length ? await protectedIntakeCommand(['MGET', ...keys]) : [];
    if (!Array.isArray(values)) throw new Error('Requests unavailable.');
    return { cursor: String(result[0]), values: values.filter((value) => typeof value === 'string') };
  }

  const result = await blobClient.list({
    prefix: pathnameForPrefix(prefix),
    cursor: decodeCursor(cursor),
    limit: 50
  });
  const values = await Promise.all(result.blobs.map((blob) => blobText(blob.pathname, blobClient)));
  return {
    cursor: result.hasMore ? encodeCursor(result.cursor) : '0',
    values: values.filter((value) => typeof value === 'string')
  };
}

export async function deleteExpiredProtectedLeads(now = Date.now(), blobClient = defaultBlobClient) {
  if (!usesBlob()) return { deleted: 0, storage: 'kv_ttl' };
  const cutoff = now - (90 * 24 * 60 * 60 * 1000);
  let cursor;
  let deleted = 0;
  do {
    const result = await blobClient.list({ prefix: BLOB_ROOT, cursor, limit: 1000 });
    const expired = result.blobs.filter((blob) => new Date(blob.uploadedAt).getTime() <= cutoff);
    if (expired.length) {
      await blobClient.del(expired.map((blob) => blob.url));
      deleted += expired.length;
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  cursor = undefined;
  const rateLimitCutoff = now - (24 * 60 * 60 * 1000);
  do {
    const result = await blobClient.list({ prefix: RATE_LIMIT_ROOT, cursor, limit: 1000 });
    const expired = result.blobs.filter((blob) => new Date(blob.uploadedAt).getTime() <= rateLimitCutoff);
    if (expired.length) {
      await blobClient.del(expired.map((blob) => blob.url));
      deleted += expired.length;
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return { deleted, storage: 'vercel_blob' };
}

export async function enforceProtectedLeadRateLimit(req, namespace, blobClient = defaultBlobClient) {
  if (!usesBlob()) {
    const forwarded = getRequestHeader(req, 'x-vercel-forwarded-for') || getRequestHeader(req, 'x-forwarded-for') || getRequestHeader(req, 'x-real-ip') || 'unknown';
    const digest = createHash('sha256').update(forwarded.split(',')[0].trim()).digest('hex').slice(0, 24);
    const key = `${namespace}:rate:${Math.floor(Date.now() / 600_000)}:${digest}`;
    const first = await protectedIntakeCommand(['SET', key, '1', 'EX', 600, 'NX']);
    const count = first === 'OK' ? 1 : Number(await protectedIntakeCommand(['INCR', key]));
    if (!Number.isInteger(count) || count > 12) throw Object.assign(new Error('Please wait before sending another request.'), { code: 'rate_limited', statusCode: 429 });
    return;
  }

  const forwarded = getRequestHeader(req, 'x-vercel-forwarded-for') || getRequestHeader(req, 'x-forwarded-for') || getRequestHeader(req, 'x-real-ip') || 'unknown';
  const digest = createHash('sha256').update(forwarded.split(',')[0].trim()).digest('hex').slice(0, 24);
  const window = Math.floor(Date.now() / 600_000);
  const prefix = `${RATE_LIMIT_ROOT}${namespace}/${window}/${digest}/`;
  await blobClient.put(`${prefix}${randomUUID()}.txt`, '1', {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: 'text/plain'
  });
  const result = await blobClient.list({ prefix, limit: 13 });
  if (result.blobs.length > 12) throw Object.assign(new Error('Please wait before sending another request.'), { code: 'rate_limited', statusCode: 429 });
}
