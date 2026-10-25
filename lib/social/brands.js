// Brand registry. Adding a brand is a new entry here and a deploy.
// Ids are permanent. Connections, tokens, and posts key off the id.
export const SOCIAL_BRANDS = [
  { id: "swingtradepros", name: "Swing Trade Pros" },
  { id: "1ststep", name: "1stStep" },
  { id: "skillsprout", name: "Skillsprout" },
  { id: "daysetgo", name: "DaySetGo" },
];

export function findBrand(id) {
  return SOCIAL_BRANDS.find((brand) => brand.id === String(id || "")) || null;
}
