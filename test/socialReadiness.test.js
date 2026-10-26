import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySocialKv, useSocialStore, resetSocialStore, savePost, listPosts, getPost, saveNonce, takeNonce } from '../lib/social/store.js';
import { publishYouTubeSlice } from '../lib/social/publishers/youtube.js';
import { YOUTUBE_SCOPES } from '../lib/social/google.js';

const reply = (status, payload = {}, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: key => headers[key] || null }, text: async () => JSON.stringify(payload) });
const post = { id: 'post-test', brand_id: 'swingtradepros', platform: 'youtube', title: 'Test', video_asset: { pathname: 'social/swingtradepros/post-test/video.mp4', size: 8 }, thumbnail_asset: { pathname: 'social/swingtradepros/post-test/thumb.jpg', size: 8 } };
const secrets = { access_token: 'test', expires_at: '2099-01-01T00:00:00Z' };

test('OAuth nonce is consumed exactly once by simultaneous callbacks', async () => {
  useSocialStore(createMemorySocialKv());
  try {
    await saveNonce('test', 'swingtradepros');
    const values = await Promise.all([takeNonce('test'), takeNonce('test')]);
    assert.equal(values.filter(Boolean).length, 1);
  } finally { resetSocialStore(); }
});

test('OAuth requests a scope accepted by videos.update', () => {
  assert.ok(YOUTUBE_SCOPES.some(scope => ['youtube', 'youtube.force-ssl', 'youtubepartner'].some(name => scope === `https://www.googleapis.com/auth/${name}`)));
});

test('YouTube checkpoints the session before bytes and preserves media on thumbnail failure', async () => {
  let durable = null;
  const deleted = [];
  const fetchImpl = async (url, options) => {
    if (String(url).includes('thumbnails')) return reply(403, { error: { message: 'thumbnail not permitted' } });
    if (options.method === 'POST') return reply(200, {}, { location: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test' });
    assert.ok(durable?.session_uri, 'session persisted before upload');
    return reply(200, { id: 'video-test' });
  };
  await assert.rejects(() => publishYouTubeSlice({ post, secrets, readRange: async (_p, a, b) => Buffer.alloc(b-a+1), fetchImpl, stage: 'draft', deadline: Date.now()+60000, checkpoint: async job => { durable = structuredClone(job); }, deleteAsset: async path => { deleted.push(path); } }), /thumbnail not permitted/);
  assert.equal(durable.video_id, 'video-test');
  assert.equal(durable.phase, 'thumbnail');
  assert.deepEqual(deleted, []);
});

test('checkpoint failure stops before sending video bytes', async () => {
  let puts = 0;
  await assert.rejects(() => publishYouTubeSlice({ post, secrets, readRange: async () => Buffer.alloc(8), fetchImpl: async (_u, opts) => { if (opts.method === 'PUT') puts++; return reply(200, { id: 'test' }, { location: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test' }); }, checkpoint: async () => { throw new Error('KV unavailable'); } }), /KV unavailable/);
  assert.equal(puts, 0);
});

// Executable acceptance cases: TODO means known unsafe behavior, not PASS.
test('concurrent creates retain both queue records', { todo: 'Requires atomic index insertion and capacity check' }, async () => {
  useSocialStore(createMemorySocialKv());
  try {
    await Promise.all([savePost({ ...post, id: 'a' }, { create: true }), savePost({ ...post, id: 'b' }, { create: true })]);
    assert.equal((await listPosts(post.brand_id)).length, 2);
  } finally { resetSocialStore(); }
});

test('stale draft write cannot overwrite owner approval', { todo: 'Requires post revision compare-and-swap on every mutation' }, async () => {
  useSocialStore(createMemorySocialKv());
  try {
    await savePost({ ...post, status: 'draft' }, { create: true });
    const stale = await getPost(post.id);
    await savePost({ ...stale, status: 'approved', approved_by: 'owner' });
    await assert.rejects(() => savePost({ ...stale, title: 'stale edit' }));
  } finally { resetSocialStore(); }
});

test('REST nonce consumption uses GETDEL and Redis command errors fail closed', async () => {
  const previousFetch = globalThis.fetch;
  const oldUrl = process.env.KV_REST_API_URL;
  const oldToken = process.env.KV_REST_API_TOKEN;
  process.env.KV_REST_API_URL = 'https://kv.test';
  process.env.KV_REST_API_TOKEN = 'test-only';
  resetSocialStore();
  try {
    globalThis.fetch = async (_url, options) => {
      assert.deepEqual(JSON.parse(options.body), ['GETDEL', 'social:v1:nonce:rest']);
      return { ok: true, json: async () => ({ result: 'swingtradepros' }) };
    };
    assert.equal(await takeNonce('rest'), 'swingtradepros');
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ error: 'ERR unknown command' }) });
    await assert.rejects(() => takeNonce('rest'), error => error.code === 'social_storage_unavailable');
  } finally {
    globalThis.fetch = previousFetch;
    if (oldUrl === undefined) delete process.env.KV_REST_API_URL; else process.env.KV_REST_API_URL = oldUrl;
    if (oldToken === undefined) delete process.env.KV_REST_API_TOKEN; else process.env.KV_REST_API_TOKEN = oldToken;
  }
});

test('overlapping publish slices acquire only one worker claim', { todo: 'Requires shared atomic claim and fencing, including draft workers' }, async () => {
  const { publishers } = await import('../lib/social/publishers/index.js');
  const { publishDueSlice } = await import('../lib/social/service.js');
  const { saveConnectionEnvelope } = await import('../lib/social/store.js');
  const { encryptSocialJson } = await import('../lib/social/tokenCrypto.js');
  const oldKey = process.env.SOCIAL_TOKEN_ENC_KEY;
  const oldId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const oldSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const oldUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const original = publishers.youtube.publishSlice;
  process.env.SOCIAL_TOKEN_ENC_KEY = 'ab'.repeat(32);
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test';
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://preview.test/api/social/oauth/callback';
  useSocialStore(createMemorySocialKv());
  let calls = 0;
  try {
    await savePost({ ...post, status: 'scheduled', scheduled_at: '2000-01-01T00:00:00Z', approved_by: 'owner', approved_at: '2000-01-01T00:00:00Z' }, { create: true });
    await saveConnectionEnvelope(post.brand_id, 'youtube', encryptSocialJson(secrets, 'social-connection'));
    publishers.youtube.publishSlice = async () => { calls++; return { done: false, job: { next_byte: 0, total_bytes: 8 } }; };
    await Promise.all([publishDueSlice(), publishDueSlice()]);
    assert.equal(calls, 1);
  } finally {
    publishers.youtube.publishSlice = original;
    resetSocialStore();
    for (const [name, value] of [['SOCIAL_TOKEN_ENC_KEY',oldKey], ['GOOGLE_OAUTH_CLIENT_ID',oldId], ['GOOGLE_OAUTH_CLIENT_SECRET',oldSecret], ['GOOGLE_OAUTH_REDIRECT_URI',oldUri]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
