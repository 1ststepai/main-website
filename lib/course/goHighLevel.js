import { fetchWithTimeout } from '../http/fetchWithTimeout.js';
import { createHash } from 'node:crypto';
import { courseTags } from './normalizeCourseSignup.js';

// Logs never include the raw email, token, or upstream response body.
const logFailure = (signup, stage, status) => console.error(JSON.stringify({event: 'course_signup_delivery_failed', kind: signup.kind, stage, status: status ?? null, email_hash: createHash('sha256').update(signup.email).digest('hex').slice(0, 12)}));

export async function deliverCourseSignup(signup, {env = process.env, fetchImpl = fetchWithTimeout} = {}) {
  const token = env.COURSE_GHL_TOKEN || env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const unavailable = statusCode => ({statusCode, payload: {ok: false, code: 'delivery_unavailable', message: 'Your request could not be saved. Please try again.'}});
  if (!token) { logFailure(signup, 'config', null); return unavailable(503); }
  const headers = {Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json', 'Content-Type': 'application/json'};
  const post = (path, body) => fetchImpl(`https://services.leadconnectorhq.com${path}`, {method: 'POST', headers, body: JSON.stringify(body)});
  try {
    const response = await post('/contacts/upsert', {locationId: env.COURSE_GHL_LOCATION_ID || 'ER85bbRj2EUSuMtO0uFQ', email: signup.email, source: signup.kind === 'library' ? '1ststep.ai /course/library' : '1ststep.ai /course'});
    if (!response.ok) { logFailure(signup, 'upsert', response.status); return unavailable(502); }
    const data = await response.json();
    const id = data?.contact?.id || data?.data?.contact?.id || data?.id;
    if (typeof id !== 'string' || !id.trim()) { logFailure(signup, 'upsert_id', response.status); return unavailable(502); }
    const tagged = await post(`/contacts/${encodeURIComponent(id)}/tags`, {tags: courseTags(signup)});
    if (!tagged.ok) { logFailure(signup, 'tags', tagged.status); return unavailable(502); }
    return {statusCode: 201, payload: {ok: true, kind: signup.kind, courseUpdates: signup.courseUpdates}};
  } catch {
    logFailure(signup, 'network', null);
    return unavailable(502);
  }
}
