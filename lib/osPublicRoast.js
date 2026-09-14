const headlines = {
  website: {
    'Page title': 'Your page arrived without introducing itself.',
    'Meta description': 'Your search preview needs a clearer introduction.',
    'Main heading': 'The main message is missing from the HTML we received.',
    'Language declaration': 'The page does not declare its language in the HTML we received.',
    'Mobile viewport': 'The mobile viewport instruction is missing from the HTML we received.',
  },
  github: {
    Description: 'The repository has a name, but no public explanation.',
    'Repository state': 'This repository is marked inactive. Is this the right build?',
  },
};

export function buildPublicRoast(result) {
  const checks = Array.isArray(result?.checks) ? result.checks : [];
  if (!checks.length) return { headline: 'Not enough public evidence for a fair roast.', strengths: [], improvements: [], nextStep: 'Try another public link or request a human review.', limit: 'No public checks were returned.' };
  const improvements = checks.filter((check) => check.suggestion);
  const strengths = checks.filter((check) => check.status === 'FOUND' || check.status === 'ACTIVE');
  const first = improvements[0];
  const headline = first
    ? headlines[result.kind]?.[first.label] || 'Here is the first thing the public evidence asks you to fix.'
    : 'No cheap shots: the basics we checked are in place.';
  return {
    headline,
    strengths: strengths.slice(0, 2).map(({ label, evidence }) => ({ label, evidence })),
    improvements: improvements.slice(0, 3).map(({ label, evidence, suggestion }) => ({ label, evidence, action: suggestion })),
    nextStep: first?.suggestion || result?.nextStep || 'A deeper review needs more evidence.',
    limit: result?.note || 'Only the public response was checked.',
  };
}
