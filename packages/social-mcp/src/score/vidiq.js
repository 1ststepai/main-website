/**
 * Optional "Connect vidIQ" upsell shown next to the free Score it result. It never blocks anything.
 * The link comes from config (env VIDIQ_AFFILIATE_URL, or the desk setting). With no value we use the
 * plain vidIQ home page and make no affiliate claim. The promo line only shows when VIDIQ_PROMO_CODE is set.
 */
export const VIDIQ_HOME = "https://vidiq.com/";
export const UPSELL_TEXT = "Want a deeper score? Connect vidIQ for search volume and competition data.";
export const DISCLOSURE = "Affiliate link: PostPath may earn a commission at no cost to you.";

export function cleanAffiliateUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function cleanPromoCode(value) {
  const raw = String(value || "").trim();
  return /^[A-Za-z0-9_-]{2,40}$/.test(raw) ? raw : "";
}

export function vidiqUpsell({ env = process.env, settings = {} } = {}) {
  const affiliateUrl = cleanAffiliateUrl(env.VIDIQ_AFFILIATE_URL) || cleanAffiliateUrl(settings.affiliate_url);
  const promo = cleanPromoCode(env.VIDIQ_PROMO_CODE) || cleanPromoCode(settings.promo_code);
  return {
    optional: true,
    text: UPSELL_TEXT,
    button: "Connect vidIQ",
    url: affiliateUrl || VIDIQ_HOME,
    affiliate: Boolean(affiliateUrl),
    // A plain vidiq.com link earns nothing, so the disclosure only appears with an affiliate link.
    disclosure: affiliateUrl ? DISCLOSURE : null,
    promo: promo ? `35% off Pro/Boost with code ${promo}` : null,
  };
}
