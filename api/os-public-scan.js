import { scanPublicTarget } from '../lib/osPublicScan.js';
import { checkRateLimit, setRateLimitHeaders } from '../lib/http/rateLimit.js';
import { applyCors, getRequestHeader } from '../lib/http/cors.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!applyCors(req, res, { methods: ['POST', 'OPTIONS'] })) { res.statusCode = 403; res.end(JSON.stringify({ error: 'ORIGIN_NOT_ALLOWED' })); return; }
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' })); return; }
  if (!getRequestHeader(req, 'content-type').toLowerCase().includes('application/json')) { res.statusCode = 415; res.end(JSON.stringify({ error: 'JSON_REQUIRED' })); return; }
  if (!req.body || typeof req.body !== 'object' || Buffer.byteLength(JSON.stringify(req.body), 'utf8') > 512) { res.statusCode = 400; res.end(JSON.stringify({ error: 'INVALID_TARGET' })); return; }
  const limit = checkRateLimit(req, 'os-public-scan');
  setRateLimitHeaders(res, limit);
  if (!limit.allowed) { res.statusCode = 429; res.end(JSON.stringify({ error: 'RATE_LIMITED' })); return; }
  const input = req.body.url;
  try {
    const result = await scanPublicTarget(input);
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, result }));
  } catch (error) {
    const code = ['INVALID_TARGET', 'PUBLIC_REPOSITORY_NOT_FOUND', 'TARGET_TIMEOUT', 'RESPONSE_TOO_LARGE', 'TARGET_UNAVAILABLE'].includes(error.message) ? error.message : 'TARGET_UNAVAILABLE';
    res.statusCode = code === 'INVALID_TARGET' ? 400 : code === 'PUBLIC_REPOSITORY_NOT_FOUND' ? 404 : 502;
    res.end(JSON.stringify({ ok: false, error: code }));
  }
}
