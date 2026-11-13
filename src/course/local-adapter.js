import { normalizeStartDates } from '../../lib/course/startDates.js';
// Unpublished loopback-only simulator. Never stores an address or sends a request.
export const MOCK_STORAGE_KEY = 'firststep.course.local-draft.v1';

const loopback = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function createLocalCourseAdapter(options = {}) {
  return {
    async submit({ kind, email, courseUpdates = false, startDates } = {}) {
      if (!['library', 'waitlist'].includes(kind) || typeof courseUpdates !== 'boolean') {
        return { ok: false, code: 'invalid-request' };
      }
      if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return { ok: false, code: 'invalid-email' };
      }
      if (kind === 'waitlist' && !courseUpdates) return { ok: false, code: 'consent-required' };
      let dates;
      try { if (kind === 'waitlist') dates = normalizeStartDates(startDates); }
      catch { return { ok: false, code: 'invalid-request' }; }
      const hostname = options.hostname ?? globalThis.location?.hostname;
      if (!loopback.has(hostname)) return { ok: false, code: 'unavailable' };
      try {
        const storage = options.storage ?? globalThis.localStorage;
        if (!storage) return { ok: false, code: 'persistence-failed' };
        // Intentionally replace a single anonymous demonstration record; no user ledger.
        const record = {
          simulation: true,
          ...(kind === 'waitlist' ? {startDates: dates} : {}),
          kind,
          courseUpdates: courseUpdates === true,
        };
        const encoded = JSON.stringify(record);
        storage.setItem(MOCK_STORAGE_KEY, encoded);
        if (storage.getItem(MOCK_STORAGE_KEY) !== encoded) {
          return { ok: false, code: 'persistence-failed' };
        }
        return { ok: true, code: 'local-simulation', courseUpdates: record.courseUpdates };
      } catch {
        return { ok: false, code: 'persistence-failed' };
      }
    },
  };
}
