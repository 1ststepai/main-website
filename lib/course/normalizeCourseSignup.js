export function normalizeCourseSignup(body) {
  const fail = code => { throw Object.assign(new Error('Invalid signup request.'), {statusCode: 400, code}); };
  if (!body || !['waitlist', 'library'].includes(body.kind) || typeof body.courseUpdates !== 'boolean') fail('invalid-request');
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('invalid-email');
  if (body.kind === 'waitlist' && !body.courseUpdates) fail('consent-required');
  return {kind: body.kind, email, courseUpdates: body.courseUpdates};
}

export function courseTags({kind, courseUpdates}) {
  return [...(kind === 'library' ? ['course-prompt-library'] : []), ...(kind === 'waitlist' || courseUpdates ? ['course-waitlist'] : [])];
}
