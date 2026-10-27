// Brand registry. Adding a brand is a new entry here and a deploy.
// Ids are permanent. Connections, tokens, and posts key off the id.
export const SOCIAL_BRANDS = [
  {
    id: "swingtradepros",
    name: "Swing Trade Pros",
    accounts: {
      youtube: { id: "UC86s7HqMAR-FSfxuv1N1Pwg", label: "@SwingTradePros" },
      instagram: { id: "28230105726692205", label: "@swing_trade_pros" },
    },
  },
  { id: "1ststep", name: "1stStep" },
  { id: "skillsprout", name: "Skillsprout" },
  { id: "daysetgo", name: "DaySetGo" },
];

export function expectedAccount(brand, platform) {
  return brand?.accounts?.[platform] || null;
}

export function findBrand(id) {
  return SOCIAL_BRANDS.find((brand) => brand.id === String(id || "")) || null;
}
