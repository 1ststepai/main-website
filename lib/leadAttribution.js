const FIELDS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'first_touch_source',
  'first_touch_campaign'
];

export function normalizeLeadAttribution(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const attribution = {};
  for (const field of FIELDS) {
    attribution[field] = typeof source[field] === 'string' ? source[field].trim().slice(0, 120) : '';
  }
  attribution.landing_path = typeof source.landing_path === 'string' && source.landing_path.startsWith('/')
    ? source.landing_path.split('?')[0].slice(0, 180)
    : '';
  return attribution;
}
