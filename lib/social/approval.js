export const VIDIQ_MIN_SCORE = 90;
export const OVERRIDE_REASON_MIN = 8;

export function normalizedKeywords(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export function youtubeScoresPass(post) {
  const title = Number(post?.title_score);
  const thumbnail = Number(post?.thumbnail_score);
  return Number.isFinite(title)
    && title >= VIDIQ_MIN_SCORE
    && Number.isFinite(thumbnail)
    && thumbnail >= VIDIQ_MIN_SCORE
    && normalizedKeywords(post?.keywords).length > 0;
}

export function vidiqBlockReason(post) {
  if (!post || post.platform !== "youtube" || youtubeScoresPass(post)) return "";
  const title = Number(post.title_score);
  const thumbnail = Number(post.thumbnail_score);
  const missing = [];
  if (!Number.isFinite(title) || title < VIDIQ_MIN_SCORE) {
    missing.push(`title score ${Number.isFinite(title) ? title : "missing"}`);
  }
  if (!Number.isFinite(thumbnail) || thumbnail < VIDIQ_MIN_SCORE) {
    missing.push(`thumbnail score ${Number.isFinite(thumbnail) ? thumbnail : "missing"}`);
  }
  if (normalizedKeywords(post.keywords).length === 0) missing.push("keywords");
  return `YouTube needs a title score and thumbnail score of at least 90, plus keywords. Missing: ${missing.join(", ")}.`;
}

export function approvalBlockReason(post) {
  if (!post) return "Choose a post.";
  if (!String(post.title || "").trim()) return "A title is required.";
  return vidiqBlockReason(post);
}

export function overrideReasonOk(reason) {
  const trimmed = String(reason || "").trim();
  return trimmed.length >= OVERRIDE_REASON_MIN && trimmed.length <= 500;
}

export function keywordsMissingFromCopy(post) {
  const haystack = [post?.title, post?.description, ...(post?.tags || [])].join("\n").toLowerCase();
  return normalizedKeywords(post?.keywords).filter((keyword) => !haystack.includes(keyword.toLowerCase()));
}
