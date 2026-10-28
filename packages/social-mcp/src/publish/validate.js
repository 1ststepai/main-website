import { PLATFORMS } from "../platforms.js";

/** Platform publish text caps grounded in `src/publish/*` (not inventing new networks). */
export const PLATFORM_TEXT_LIMITS = {
  x: 280,
  linkedin: 3000,
  threads: 500,
  bluesky: 300,
  google_business: 1500,
  /** createDraft caption ceiling; Meta publish also slices caption to this. */
  instagram: 2200,
  facebook: 2200,
  /** Pinterest pin description slice in publish/pinterest.js */
  pinterest: 800,
  /** Reddit self-post body slice */
  reddit: 40000,
  /** YouTube description slice */
  youtube: 5000,
};

/** createDraft field ceilings from engine.js (for length warnings on raw post objects). */
export const DRAFT_FIELD_LIMITS = {
  title: 100,
  description: 5000,
  caption: 2200,
  media_url: 2000,
};

const HTTPS_URL = /^https:\/\//i;
const KNOWN = new Set(PLATFORMS);

function push(list, message) {
  if (message && !list.includes(message)) list.push(message);
}

function primaryText(post) {
  return String(post?.caption || post?.description || post?.title || "").trim();
}

function hasNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function warnIfOver(warnings, label, value, limit) {
  if (typeof value === "string" && value.length > limit) {
    push(
      warnings,
      `${label} is ${value.length} characters; ${limit} is the publish/draft cap (excess is truncated on publish).`,
    );
  }
}

function requireHttpsMediaUrl(post, errors, platformLabel) {
  const mediaUrl = String(post?.media_url || "").trim();
  if (!HTTPS_URL.test(mediaUrl)) {
    push(errors, `${platformLabel} publish needs a public https media_url on the post.`);
  }
}

function requireMediaPath(post, errors, platformLabel) {
  if (!hasNonEmpty(post?.media_path)) {
    push(errors, `${platformLabel} publish needs media_path under the PostPath media directory.`);
  }
}

function requireText(post, errors, platformLabel) {
  if (!primaryText(post)) {
    push(errors, `${platformLabel} posts need caption or description text.`);
  }
}

/**
 * Pure pre-publish validation for a PostPath draft/post object.
 * Does not call live APIs and does not mutate the post.
 *
 * @param {object} post
 * @returns {{ ok: boolean, warnings: string[], errors: string[] }}
 */
export function validateDraftForPublish(post) {
  const warnings = [];
  const errors = [];

  if (!post || typeof post !== "object") {
    return { ok: false, warnings, errors: ["Post object is required."] };
  }

  const platform = String(post.platform || "").trim();
  if (!platform) {
    push(errors, "platform is required.");
    return { ok: false, warnings, errors };
  }
  if (!KNOWN.has(platform)) {
    push(errors, `Unknown platform "${platform}". Supported: ${PLATFORMS.join(", ")}.`);
    return { ok: false, warnings, errors };
  }

  // Draft-field ceilings (engine createDraft slices these).
  warnIfOver(warnings, "title", String(post.title || ""), DRAFT_FIELD_LIMITS.title);
  warnIfOver(warnings, "description", String(post.description || ""), DRAFT_FIELD_LIMITS.description);
  warnIfOver(warnings, "caption", String(post.caption || ""), DRAFT_FIELD_LIMITS.caption);
  if (post.media_url != null) {
    warnIfOver(warnings, "media_url", String(post.media_url), DRAFT_FIELD_LIMITS.media_url);
  }

  switch (platform) {
    case "snapchat":
      push(
        errors,
        "Snapchat publishing requires Marketing API / Public Profile approval. Connection can be stored; live publish is not available without that access.",
      );
      break;

    case "whatsapp":
      push(
        errors,
        "WhatsApp Channels do not offer a free third-party publish API for this product. Connection scaffolding only — use Meta Business tools for Channels until an approved API path exists.",
      );
      break;

    case "youtube":
      requireMediaPath(post, errors, "YouTube");
      warnIfOver(
        warnings,
        "YouTube description",
        String(post.description || post.caption || ""),
        PLATFORM_TEXT_LIMITS.youtube,
      );
      break;

    case "tiktok":
      requireMediaPath(post, errors, "TikTok");
      break;

    case "instagram":
      if ((post.privacy_status || "private") !== "public") {
        push(
          errors,
          "Instagram Reels publish is public. Set privacy_status to public to publish. PostPath will not upload the file until you do.",
        );
      }
      if (!hasNonEmpty(post?.media_path) && !HTTPS_URL.test(String(post?.media_url || "").trim())) {
        push(errors, "Instagram needs a local media_path or a public https media_url.");
      }
      warnIfOver(warnings, "Instagram caption", primaryText(post), PLATFORM_TEXT_LIMITS.instagram);
      break;

    case "facebook":
      if (!hasNonEmpty(post?.media_path) && !HTTPS_URL.test(String(post?.media_url || "").trim())) {
        push(errors, "Facebook needs a local media_path or a public https media_url.");
      }
      warnIfOver(warnings, "Facebook caption", primaryText(post), PLATFORM_TEXT_LIMITS.facebook);
      break;

    case "pinterest":
      requireHttpsMediaUrl(post, errors, "Pinterest");
      warnIfOver(
        warnings,
        "Pinterest description",
        String(post.description || post.caption || ""),
        PLATFORM_TEXT_LIMITS.pinterest,
      );
      break;

    case "x":
      requireText(post, errors, "X");
      warnIfOver(warnings, "X caption", primaryText(post), PLATFORM_TEXT_LIMITS.x);
      break;

    case "linkedin":
      requireText(post, errors, "LinkedIn");
      warnIfOver(warnings, "LinkedIn caption", primaryText(post), PLATFORM_TEXT_LIMITS.linkedin);
      break;

    case "bluesky":
      requireText(post, errors, "Bluesky");
      warnIfOver(warnings, "Bluesky caption", primaryText(post), PLATFORM_TEXT_LIMITS.bluesky);
      break;

    case "google_business":
      requireText(post, errors, "Google Business");
      warnIfOver(
        warnings,
        "Google Business caption",
        primaryText(post),
        PLATFORM_TEXT_LIMITS.google_business,
      );
      break;

    case "threads": {
      const text = primaryText(post);
      const mediaUrl = String(post.media_url || "").trim();
      if (!text && !mediaUrl) {
        push(errors, "Threads posts need caption text and/or media_url.");
      }
      if (mediaUrl && !HTTPS_URL.test(mediaUrl)) {
        push(errors, "Threads image posts need a public https media_url.");
      }
      if (text) {
        warnIfOver(warnings, "Threads caption", text, PLATFORM_TEXT_LIMITS.threads);
      }
      break;
    }

    case "reddit": {
      const subreddit = String(post.tags?.[0] || "")
        .trim()
        .replace(/^r\//i, "");
      if (!subreddit) {
        push(
          errors,
          "Set tags[0] to the target subreddit name (without r/) before publishing to Reddit.",
        );
      }
      const redditTitle = String(post.title || post.caption || "").trim();
      if (!redditTitle) {
        push(errors, "Reddit posts need a title.");
      } else {
        warnIfOver(warnings, "Reddit title", redditTitle, 300);
      }
      const body = String(post.description || post.caption || "");
      warnIfOver(warnings, "Reddit body", body, PLATFORM_TEXT_LIMITS.reddit);
      break;
    }

    default:
      push(errors, `Platform "${platform}" has no pre-publish rules yet.`);
      break;
  }

  return {
    ok: errors.length === 0,
    warnings,
    errors,
  };
}
