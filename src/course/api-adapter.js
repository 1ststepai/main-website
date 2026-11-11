export function createCourseApiAdapter({fetchImpl = globalThis.fetch} = {}) {
  return {
    async submit(body) {
      const response = await fetchImpl('/api/course-signup', {
        method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': globalThis.crypto.randomUUID()},
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) return {ok: false, code: result.code || 'unavailable'};
      return {ok: true, kind: result.kind, courseUpdates: result.courseUpdates};
    },
  };
}
