import { DRAFT_FIELD_LIMITS, PLATFORM_TEXT_LIMITS } from "./limits.js";

/** Fields a network override can change. Base title/caption/tags stay for older drafts. */
export const VARIANT_FIELDS = ["title", "description", "caption", "hashtags", "tags", "subreddit"];

const KNOWN_SOURCES = new Set(["assistant", "vidiq", "tubebuddy"]);

/**
 * TubeBuddy publishes no product API and no MCP server.
 * tubebuddy.com/mcp redirects to pricing; tubebuddy.com/api is a 404.
 * https://www.tubebuddy.com/faq describes a browser extension only.
 * vidIQ does publish an MCP at https://mcp.vidiq.com/mcp. PostPath does not call it.
 */
export const SOURCE_NOTES = {
  vidiq: "PostPath does not call vidIQ. A vidIQ opinion shows up only when your assistant sends it.",
  tubebuddy:
    "TubeBuddy is not available. It has no public API or MCP, and PostPath will not open it in a browser. A TubeBuddy line shows up only when your assistant sends one it already has.",
};

function clip(value, max) {
  return String(value || "").slice(0, max);
}

function stringList(value, maxItems, maxLen) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[,|\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
  const out = [];
  for (const item of raw) {
    const text = String(item).trim().slice(0, maxLen);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function normalizeVariant(input) {
  if (!input || typeof input !== "object") return null;
  return {
    same_as_base: input.same_as_base !== false,
    title: clip(input.title, DRAFT_FIELD_LIMITS.title),
    description: clip(input.description, DRAFT_FIELD_LIMITS.description),
    caption: clip(input.caption, DRAFT_FIELD_LIMITS.caption),
    hashtags: stringList(input.hashtags, 60, 80),
    tags: stringList(input.tags, 30, 40),
    subreddit: clip(input.subreddit, 40).replace(/^r\//i, ""),
  };
}

export function normalizeVariants(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  for (const [platform, value] of Object.entries(input)) {
    const key = String(platform || "").trim();
    if (!/^[a-z0-9_]{2,32}$/.test(key)) continue;
    const variant = normalizeVariant(value);
    if (variant) out[key] = variant;
  }
  return out;
}

function hashToken(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.startsWith("#") ? text : `#${text}`;
}

function hashtagList(value) {
  return stringList(value, 60, 80).map(hashToken).filter(Boolean);
}

function textHasHashtag(text, tag) {
  const needle = tag.replace(/^#/, "").toLowerCase();
  return String(text || "")
    .toLowerCase()
    .split(/[^#\p{L}\p{N}_]+/u)
    .some((part) => part.replace(/^#/, "") === needle);
}

export function resolvePostForPublish(post) {
  const source = post && typeof post === "object" ? post : {};
  const next = {
    ...source,
    tags: Array.isArray(source.tags) ? [...source.tags] : [],
  };
  const variant = source.variants?.[source.platform];
  if (!variant || variant.same_as_base !== false) return next;
  if (variant.title) next.title = variant.title;
  if (variant.description) next.description = variant.description;
  if (variant.caption) next.caption = variant.caption;
  if (variant.tags?.length) next.tags = [...variant.tags];
  if (source.platform === "reddit" && variant.subreddit) {
    const others = next.tags.filter((tag) => tag.replace(/^r\//i, "").toLowerCase() !== variant.subreddit.toLowerCase());
    next.tags = [variant.subreddit, ...others];
  }
  const hashes = hashtagList(variant.hashtags);
  if (hashes.length) {
    const field = source.platform === "youtube" || source.platform === "pinterest" ? "description" : "caption";
    const current = String(next[field] || "");
    const missing = hashes.filter((tag) => !textHasHashtag(current, tag));
    if (missing.length) {
      next[field] = current.trim() ? `${current.trim()}\n${missing.join(" ")}` : missing.join(" ");
    }
  }
  return next;
}

function push(items, item) {
  items.push(item);
}

function hashtagsIn(text, extra) {
  const found = new Set(hashtagList(extra));
  const matches = String(text || "").match(/#[\p{L}\p{N}_]+/gu) || [];
  for (const tag of matches) found.add(tag);
  return [...found];
}

/**
 * Live checks. `kind: "rule"` is from an official page cited below.
 * `kind: "tip"` is not a platform requirement.
 *
 * YouTube hashtags: more than 60 are ignored.
 * https://support.google.com/youtube/answer/6390658
 * YouTube keyword tags: snippet.tags max 500 characters.
 * https://developers.google.com/youtube/v3/docs/videos#snippet.tags
 * Shorts: square or vertical, up to 3 minutes, for uploads on or after 15 Oct 2024.
 * https://support.google.com/youtube/answer/15424877
 * Instagram: up to 5 tags; spaces and special characters do not work.
 * https://help.instagram.com/351460621611097
 * Threads: one topic tag, up to 50 characters.
 * https://help.instagram.com/1356090605000312
 */
export function checkNetwork({ platform, post, media } = {}) {
  const resolved = resolvePostForPublish({ ...(post || {}), platform });
  const items = [];
  const limit = PLATFORM_TEXT_LIMITS[platform];
  const body =
    platform === "youtube" || platform === "pinterest"
      ? String(resolved.description || resolved.caption || "")
      : String(resolved.caption || resolved.description || resolved.title || "");
  if (limit && body.length > limit) {
    push(items, {
      kind: "rule",
      field: "caption",
      message: `${body.length} characters is over the ${limit} character limit for this network.`,
    });
  }
  if (platform === "youtube") {
    const title = String(resolved.title || "");
    if (!title.trim()) {
      push(items, { kind: "rule", field: "title", message: "YouTube needs a title." });
    } else if (title.length > DRAFT_FIELD_LIMITS.title) {
      push(items, { kind: "rule", field: "title", message: `Title is over ${DRAFT_FIELD_LIMITS.title} characters.` });
    }
    const hashes = hashtagsIn(`${resolved.title || ""} ${resolved.description || ""}`, resolved.variants?.youtube?.hashtags);
    if (hashes.length > 60) {
      push(items, {
        kind: "rule",
        field: "hashtags",
        message: `${hashes.length} hashtags. YouTube ignores every hashtag after 60.`,
      });
    }
    const tagText = (resolved.tags || []).join(",");
    if (tagText.length > 500) {
      push(items, {
        kind: "rule",
        field: "tags",
        message: `Keyword tags are ${tagText.length} characters. YouTube's limit for the tag list is 500.`,
      });
    }
    push(items, {
      kind: "tip",
      field: "thumbnail",
      message: "This window does not attach a separate thumbnail. YouTube can make one from the video.",
    });
    items.push(...shortsChecks(media));
  }
  if (platform === "instagram" || platform === "facebook") {
    const hashes = hashtagsIn(resolved.caption || resolved.description || "", resolved.variants?.[platform]?.hashtags);
    const bad = hashes.filter((tag) => !/^#[\p{L}\p{N}_]+$/u.test(tag));
    if (bad.length) {
      push(items, { kind: "rule", field: "hashtags", message: "Instagram hashtags cannot contain spaces or symbols like $ or %." });
    }
    if (platform === "instagram" && hashes.length > 5) {
      push(items, {
        kind: "rule",
        field: "hashtags",
        message: `${hashes.length} hashtags. Instagram's help page says a post can use up to 5 tags.`,
      });
    }
  }
  if (platform === "threads") {
    const hashes = hashtagsIn(resolved.caption || "", resolved.variants?.threads?.hashtags);
    if (hashes.length > 1) {
      push(items, { kind: "rule", field: "hashtags", message: "Threads allows one topic tag on a post." });
    }
    if (hashes.some((tag) => tag.length > 51)) {
      push(items, { kind: "rule", field: "hashtags", message: "A Threads topic can be up to 50 characters." });
    }
  }
  if (platform === "x") {
    push(items, {
      kind: "tip",
      field: "hashtags",
      message: "Hashtags count toward the 280 character post. X does not publish a separate hashtag cap.",
    });
  }
  if (platform === "linkedin") {
    push(items, {
      kind: "tip",
      field: "hashtags",
      message: "LinkedIn does not publish a hard hashtag cap. Hashtags count toward the 3,000 character post.",
    });
  }
  if (platform === "reddit" && !String(resolved.tags?.[0] || "").trim()) {
    push(items, { kind: "rule", field: "subreddit", message: "Reddit needs a community name before it can be published." });
  }
  if (!body.trim() && platform !== "youtube") {
    push(items, { kind: "rule", field: "caption", message: "Add words for this network, or leave it the same as the base post." });
  }
  return items;
}

function shortsChecks(media) {
  if (!media || !media.width || !media.height) {
    return [{ kind: "tip", field: "video", message: "Couldn't read this video's shape. Shorts are square or vertical, up to 3 minutes." }];
  }
  const items = [];
  const vertical = media.height >= media.width;
  const duration = Number(media.durationSec);
  if (!vertical) {
    items.push({ kind: "rule", field: "video", message: "This video is wider than it is tall, so YouTube will not treat it as a Short." });
  }
  if (Number.isFinite(duration) && duration > 180) {
    items.push({ kind: "rule", field: "video", message: "This video is longer than 3 minutes, so it is not a Short." });
  } else if (vertical && Number.isFinite(duration) && duration <= 180) {
    items.push({ kind: "ok", field: "video", message: "Square or vertical, and within 3 minutes. That matches YouTube's Shorts shape." });
  } else if (!Number.isFinite(duration)) {
    items.push({ kind: "tip", field: "video", message: "Couldn't read the length. Shorts are up to 3 minutes." });
  }
  return items;
}

export function readMp4Meta(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  function boxes(start, end) {
    const found = [];
    let offset = start;
    while (offset + 8 <= end) {
      const size32 = view.getUint32(offset);
      const type = String.fromCharCode(buf[offset + 4], buf[offset + 5], buf[offset + 6], buf[offset + 7]);
      let size = size32;
      let header = 8;
      if (size32 === 1 && offset + 16 <= end) {
        size = Number(view.getBigUint64(offset + 8));
        header = 16;
      }
      if (!size || size < header || offset + size > end) break;
      found.push({ type, start: offset + header, end: offset + size });
      offset += size;
    }
    return found;
  }
  const root = boxes(0, buf.length);
  const moov = root.find((box) => box.type === "moov");
  if (!moov) return null;
  const inner = boxes(moov.start, moov.end);
  const mvhd = inner.find((box) => box.type === "mvhd");
  let durationSec = null;
  if (mvhd && mvhd.start + 20 <= mvhd.end) {
    const version = view.getUint8(mvhd.start);
    if (version === 0 && mvhd.start + 20 <= buf.length) {
      const timescale = view.getUint32(mvhd.start + 12);
      const duration = view.getUint32(mvhd.start + 16);
      if (timescale) durationSec = duration / timescale;
    }
  }
  let width = 0;
  let height = 0;
  for (const box of inner) {
    if (box.type !== "trak") continue;
    const tkhd = boxes(box.start, box.end).find((child) => child.type === "tkhd");
    if (!tkhd || tkhd.start + 84 > tkhd.end) continue;
    const version = view.getUint8(tkhd.start);
    const widthAt = version === 0 ? tkhd.start + 76 : tkhd.start + 88;
    if (widthAt + 8 <= tkhd.end) {
      width = view.getUint32(widthAt) / 65536;
      height = view.getUint32(widthAt + 4) / 65536;
    }
  }
  if (!width && !height && durationSec == null) return null;
  return { width, height, durationSec };
}

export function normalizeSource(source) {
  const text = String(source || "").trim().toLowerCase().slice(0, 32);
  if (!text) return "";
  if (KNOWN_SOURCES.has(text)) return text;
  return text.replace(/[^a-z0-9_-]/g, "").slice(0, 32);
}

export function normalizeSuggestion(input, index = 0) {
  if (!input || typeof input !== "object") return null;
  const source = normalizeSource(input.source);
  const platform = String(input.platform || "").trim();
  const field = String(input.field || "").trim();
  if (!source || !platform || !VARIANT_FIELDS.includes(field)) return null;
  let value = input.value;
  if (field === "hashtags" || field === "tags") value = stringList(value, 60, 80);
  else value = clip(value, field === "description" ? 5000 : field === "caption" ? 2200 : 100);
  if ((Array.isArray(value) && !value.length) || (!Array.isArray(value) && !String(value).trim())) return null;
  let score = null;
  if (input.score && typeof input.score === "object" && input.score.name != null && input.score.value != null && input.score.value !== "") {
    score = {
      name: clip(input.score.name, 40),
      value: typeof input.score.value === "number" ? input.score.value : clip(input.score.value, 40),
    };
  }
  return {
    id: clip(input.id, 40) || `sug_${index}`,
    source,
    platform,
    field,
    value,
    score,
    note: clip(input.note, 240),
    status: input.status === "accepted" || input.status === "rejected" ? input.status : "pending",
  };
}

export function suggestionKey(suggestion) {
  const value = Array.isArray(suggestion.value) ? suggestion.value.map((item) => item.toLowerCase()).join("|") : String(suggestion.value || "").trim().toLowerCase();
  return value;
}

export function groupSuggestions(suggestions) {
  const groups = new Map();
  for (const suggestion of suggestions || []) {
    if (!suggestion) continue;
    const id = `${suggestion.platform}:${suggestion.field}`;
    if (!groups.has(id)) groups.set(id, { platform: suggestion.platform, field: suggestion.field, items: [] });
    groups.get(id).items.push(suggestion);
  }
  return [...groups.values()].map((group) => {
    const counts = new Map();
    for (const item of group.items) {
      if (item.status === "rejected") continue;
      const key = suggestionKey(item);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return {
      ...group,
      items: group.items.map((item) => ({
        ...item,
        agreement: (counts.get(suggestionKey(item)) || 0) > 1 ? "agree" : "differ",
      })),
    };
  });
}

export function applySuggestion(post, suggestion) {
  const variants = { ...(post.variants || {}) };
  const current = { ...(variants[suggestion.platform] || { same_as_base: true, title: "", description: "", caption: "", hashtags: [], tags: [], subreddit: "" }) };
  current.same_as_base = false;
  current[suggestion.field] = suggestion.value;
  variants[suggestion.platform] = current;
  return variants;
}
