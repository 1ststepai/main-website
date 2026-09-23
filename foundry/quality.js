export const TIERS = {
  full: { dpr:1.5, radial:8, segments:120, bevel:2, curve:12, teeth:48, fins:5, traces:10, tube:12 },
  balanced: { dpr:1, radial:6, segments:64, bevel:1, curve:6, teeth:24, fins:2, traces:6, tube:6 },
  lite: { dpr:1, radial:4, segments:32, bevel:0, curve:3, teeth:0, fins:0, traces:3, tube:3 },
};
export function initialTier() {
  // Coarse input and resource constraints affect complexity, not just viewport width.
  return matchMedia('(pointer:coarse)').matches || (navigator.hardwareConcurrency && navigator.hardwareConcurrency<=4) || navigator.connection?.saveData ? 'lite' : 'balanced';
}
