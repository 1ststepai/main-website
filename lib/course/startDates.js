// Shared public allowlist; canonical order also stabilizes idempotency hashes.
export const COURSE_START_DATES = Object.freeze(['dec13', 'jan3', 'jan10', 'none']);
export function normalizeStartDates(value = []) {
  if (!Array.isArray(value) || value.some(key => typeof key !== 'string' || !COURSE_START_DATES.includes(key))) {
    throw Object.assign(new Error('Invalid start dates.'), {statusCode: 400, code: 'invalid-request'});
  }
  return COURSE_START_DATES.filter(key => value.includes(key));
}
