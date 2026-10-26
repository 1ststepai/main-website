export const PLATFORMS = ["youtube", "instagram", "facebook", "tiktok", "x"];
export const POST_STATUSES = [
  "draft",
  "ready_for_review",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "handed_off",
  "failed",
  "rejected",
];
export const AGENT_STATUSES = ["draft", "ready_for_review"];
export const REVIEWABLE_STATUSES = ["draft", "ready_for_review", "rejected"];
export const PRIVACY_STATUSES = ["private", "unlisted", "public"];
export const VIDEO_CONTENT_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const THUMBNAIL_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_MAX_BYTES = 8 * 1024 * 1024 * 1024;
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
export const YOUTUBE_CHUNK_BYTES = 2 * 1024 * 1024;
export const PUBLISH_BUDGET_MS = 8000;
export const POST_INDEX_LIMIT = 500;
export const TOKEN_INDEX_LIMIT = 100;

export const CONTENT_TYPE_EXTENSION = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
