import { timingSafeEqual } from 'node:crypto';
import { deleteExpiredProtectedLeads } from '../lib/protectedLeadStore.js';

function authorized(req) {
  const expected = process.env.CRON_SECRET;
  const supplied = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
  if (!expected) return false;
  const expectedBuffer = Buffer.from(`Bearer ${expected}`);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end(JSON.stringify({ error: 'method_not_allowed' }));
  }
  if (!authorized(req)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }
  try {
    const result = await deleteExpiredProtectedLeads();
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    console.error(JSON.stringify({ event: 'lead_retention_cleanup_failed', code: error?.name || 'unknown_error' }));
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'cleanup_unavailable' }));
  }
}
