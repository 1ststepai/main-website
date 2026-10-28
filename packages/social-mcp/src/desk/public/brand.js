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

export function scopeToBrand(items, brandId) {
  const id = String(brandId || "");
  const rows = Array.isArray(items) ? items : [];
  if (!id) return [];
  return rows.filter((row) => row && row.profile_id === id);
}
