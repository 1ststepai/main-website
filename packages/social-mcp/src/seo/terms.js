const STOPWORDS = new Set(["a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "with", "at", "by"]);

export function normalizeTerm(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export function alnum(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function fitText(value, limit) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  const max = Math.max(0, Number(limit) || 0);
  if (clean.length <= max) return clean;
  if (max < 1) return "";
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > Math.min(24, Math.floor(max * 0.4)) ? cut.slice(0, space) : cut).trim();
}

export function toHashtag(term) {
  const compact = alnum(term);
  if (compact.length < 2) return "";
  return `#${compact.slice(0, 40)}`;
}

export function uniqueStrings(list, limit = 40) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const clean = String(item || "").trim();
    const key = normalizeTerm(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(clean.slice(0, 80));
    if (out.length >= limit) break;
  }
  return out;
}

export function isWeakTerm(term) {
  const key = normalizeTerm(term);
  const compact = alnum(term);
  if (!key) return true;
  if (compact.length < 3) return true;
  if (STOPWORDS.has(key)) return true;
  return false;
}

export function containsTerm(text, term) {
  const hay = normalizeTerm(text);
  const needle = normalizeTerm(term);
  if (!hay || !needle) return false;
  return hay.includes(needle);
}

export function firstLine(text) {
  return String(text || "").split(/\r?\n/)[0] || "";
}

export function tokens(text) {
  return normalizeTerm(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

export function nearDuplicateTitle(left, right) {
  const a = normalizeTerm(left);
  const b = normalizeTerm(right);
  if (!a || !b) return false;
  if (a === b && a.length >= 12) return true;
  const leftTokens = new Set(tokens(a));
  const rightTokens = new Set(tokens(b));
  if (leftTokens.size < 3 || rightTokens.size < 3) return false;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  const union = leftTokens.size + rightTokens.size - shared;
  return union > 0 && shared / union >= 0.8;
}

export function hashtagRelevant(tag, keywords) {
  const compact = alnum(tag);
  if (compact.length < 3) return false;
  for (const keyword of keywords) {
    const other = alnum(keyword);
    if (other.length < 3) continue;
    if (compact === other || compact.includes(other) || other.includes(compact)) return true;
  }
  return false;
}
