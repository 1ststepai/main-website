export const BRAND_STORAGE_KEY = "postpath.brand.v1";

export function brandCapMessage(license) {
  if (!license || license.enforce !== true || license.profileLimit == null || license.profileLimit === "") return "";
  const limit = Number(license.profileLimit);
  if (!Number.isFinite(limit)) return "";
  const count = Math.max(0, Math.floor(limit));
  return `Your plan allows ${count} ${count === 1 ? "brand" : "brands"}.`;
}

export function chooseBrandId(profiles, remembered) {
  const rows = Array.isArray(profiles) ? profiles : [];
  const wanted = String(remembered || "");
  if (wanted && rows.some((row) => row?.id === wanted)) return wanted;
  return rows[0]?.id || "";
}

export function waitingOnYouCount(queue, brandId) {
  const id = String(brandId || "");
  return (Array.isArray(queue) ? queue : []).filter((item) => {
    if (!item || item.scheduled_at) return false;
    return !id || item.profile_id === id;
  }).length;
}

export function waitingOnYouLabel(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  return n === 1 ? "Waiting on you" : `Waiting on you · ${n}`;
}

export function scopeToBrand(items, brandId) {
  const id = String(brandId || "");
  const rows = Array.isArray(items) ? items : [];
  if (!id) return [];
  return rows.filter((row) => row && row.profile_id === id);
}
