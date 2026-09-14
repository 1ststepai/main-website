import { isSameOriginRequest } from '../lib/admin/auth.js';
import { checkRateLimit, setRateLimitHeaders } from '../lib/http/rateLimit.js';
import { enforceJourneyRateLimit } from '../lib/journey/intakeStore.js';
import { saveRoastRequest } from '../lib/osRoastIntake.js';

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, code: 'method_not_allowed' });
  if (!isSameOriginRequest(req)) return reply(res, 403, { ok: false, code: 'origin_not_allowed' });
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return reply(res, 415, { ok: false, code: 'json_required' });
  const limit = checkRateLimit(req, 'os-roast-intake');
  setRateLimitHeaders(res, limit);
  if (!limit.allowed) return reply(res, 429, { ok: false, code: 'rate_limited', message: 'Please wait before trying again.' });
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    if (Buffer.byteLength(raw, 'utf8') > 1024) return reply(res, 413, { ok: false, code: 'payload_too_large' });
    await enforceJourneyRateLimit(req, 'os-roast');
    const result = await saveRoastRequest(JSON.parse(raw));
    return reply(res, 200, { ok: true, ...result });
  } catch (error) {
    const status = Number(error.statusCode) || (error instanceof SyntaxError ? 400 : 503);
    return reply(res, status, { ok: false, code: error.code || (status === 400 ? 'invalid_request' : 'intake_unavailable'), message: status >= 500 ? 'We could not save your request. Your scan remains on this page; please try again.' : error.message });
  }
}
