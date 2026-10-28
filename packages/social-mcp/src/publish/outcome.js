import { mcpError } from "../errors.js";

const RATE_CODES = new Set([4, 17, 32, 613]);

export function publishMode(env = process.env) {
  const value = String(env.SOCIAL_MCP_PUBLISH_MODE || env.POSTPATH_PUBLISH_MODE || "")
    .trim()
    .toLowerCase();
  return value === "mock" ? "mock" : "live";
}

export function displayOutcome(post) {
  if (!post) return "";
  if (post.status === "published") return "posted";
  if (post.status === "needs_review") return "needs_review";
  if (post.status === "handed_off") return "handed_off";
  if (post.status === "failed" && post.error?.code === "rate_limited") return "rate_limited";
  if (post.status === "failed") return "failed";
  return post.status || "";
}

function errorText(payload) {
  const reason = payload?.error?.errors?.[0]?.reason || payload?.error?.status || "";
  const message = payload?.error?.message || payload?.error?.error_user_msg || payload?.error_description || "";
  return {
    reason: String(reason || ""),
    message: String(message || ""),
    metaCode: Number(payload?.error?.code || 0),
  };
}

/**
 * Map a platform HTTP response onto the desk outcomes.
 * rate_limited → failed row with code rate_limited
 * ambiguous (HTTP 5xx after the request was sent) → needs_review
 * anything else that is not ok → failed
 */
export function mapPlatformError(response, payload, fallback = {}) {
  const status = Number(response?.status || 0);
  const { reason, message, metaCode } = errorText(payload);
  const text = message || fallback.message || "Platform request failed.";
  const blob = `${reason} ${text}`.toLowerCase().replace(/[_\s]/g, "");
  if (status === 429 || RATE_CODES.has(metaCode) || /quotaexceeded|ratelimit|userratelimit|uploadratelimit/.test(blob)) {
    return mcpError("rate_limited", text, 429);
  }
  if (/notprivate|unverified|audit|youtubesignuprequired/.test(blob) && /private|verif|audit|upload/.test(blob)) {
    return mcpError(
      "youtube_unverified_scope",
      `${text} Unverified YouTube apps can only upload private videos. Set privacy to private.`,
      403,
    );
  }
  if (status >= 500) {
    const error = mcpError("dispatch_ambiguous", text, status);
    error.ambiguous = true;
    return error;
  }
  return mcpError(fallback.code || "publish_failed", text, status || 502);
}
