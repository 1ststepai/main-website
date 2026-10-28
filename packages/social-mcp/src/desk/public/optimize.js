import { DRAFT_FIELD_LIMITS, PLATFORM_TEXT_LIMITS } from "./limits.js";

/**
 * Live checks for a network after the base post and its override are combined.
 * kind "rule" comes from an official page. kind "tip" is not a requirement.
 *
 * YouTube hashtags over 60 are ignored:
 * https://support.google.com/youtube/answer/6390658
 * YouTube keyword tags, snippet.tags, max 500 characters:
 * https://developers.google.com/youtube/v3/docs/videos#snippet.tags
 * Shorts are square or vertical and up to 3 minutes (uploads on or after 15 Oct 2024):
 * https://support.google.com/youtube/answer/15424877
 * Instagram: up to 5 tags; spaces and characters like $ or % do not work:
 * https://help.instagram.com/351460621611097
 * Threads: one topic tag, up to 50 characters:
 * https://help.instagram.com/1356090605000312
 */
export function checkNetwork({ platform, post, media } = {}) {
  const resolved = post || {};
  const items = [];
  const limit = PLATFORM_TEXT_LIMITS[platform];
  const body =
    platform === "youtube" || platform === "pinterest"
      ? String(resolved.description || resolved.caption || "")
      : String(resolved.caption || resolved.description || resolved.title || "");
  if (limit && body.length > limit) {
    items.push({
      kind: "rule",
      message: `${body.length} characters is over the ${limit} character limit for this network.`,
    });
  }
  const hashes = hashtagsIn(`${resolved.title || ""} ${resolved.description || ""} ${resolved.caption || ""}`);
  if (platform === "youtube") {
    if (!String(resolved.title || "").trim()) items.push({ kind: "rule", message: "YouTube needs a title." });
    if (String(resolved.title || "").length > DRAFT_FIELD_LIMITS.title) {
      items.push({ kind: "rule", message: `Title is over ${DRAFT_FIELD_LIMITS.title} characters.` });
    }
    if (hashes.length > 60) items.push({ kind: "rule", message: `${hashes.length} hashtags. YouTube ignores every hashtag after 60.` });
    const tagText = (resolved.tags || []).join(",");
    if (tagText.length > 500) {
      items.push({ kind: "rule", message: `Keyword tags are ${tagText.length} characters. YouTube's limit for the tag list is 500.` });
    }
    items.push({ kind: "tip", message: "This window does not attach a separate thumbnail. YouTube can make one from the video." });
    items.push(...shortsChecks(media));
  }
  if (platform === "instagram" || platform === "facebook") {
    if (hashes.some((tag) => !/^#[\p{L}\p{N}_]+$/u.test(tag))) {
      items.push({ kind: "rule", message: "Instagram hashtags cannot contain spaces or symbols like $ or %." });
    }
    if (platform === "instagram" && hashes.length > 5) {
      items.push({ kind: "rule", message: `${hashes.length} hashtags. Instagram's help page says a post can use up to 5 tags.` });
    }
  }
  if (platform === "threads") {
    if (hashes.length > 1) items.push({ kind: "rule", message: "Threads allows one topic tag on a post." });
    if (hashes.some((tag) => tag.length > 51)) items.push({ kind: "rule", message: "A Threads topic can be up to 50 characters." });
  }
  if (platform === "x") {
    items.push({ kind: "tip", message: "Hashtags count toward the 280 character post. X does not publish a separate hashtag cap." });
  }
  if (platform === "linkedin") {
    items.push({ kind: "tip", message: "LinkedIn does not publish a hard hashtag cap. Hashtags count toward the 3,000 character post." });
  }
  if (platform === "reddit" && !String(resolved.tags?.[0] || "").trim()) {
    items.push({ kind: "rule", message: "Reddit needs a community name before it can be published." });
  }
  return items;
}

function hashtagsIn(text) {
  return String(text || "").match(/#[\p{L}\p{N}_]+/gu) || [];
}

function shortsChecks(media) {
  if (!media || !media.width || !media.height) {
    return [{ kind: "tip", message: "Couldn't read this video's shape. Shorts are square or vertical, up to 3 minutes." }];
  }
  const items = [];
  const vertical = media.height >= media.width;
  const duration = Number(media.durationSec);
  if (!vertical) items.push({ kind: "rule", message: "This video is wider than it is tall, so YouTube will not treat it as a Short." });
  if (Number.isFinite(duration) && duration > 180) {
    items.push({ kind: "rule", message: "This video is longer than 3 minutes, so it is not a Short." });
  } else if (vertical && Number.isFinite(duration) && duration <= 180) {
    items.push({ kind: "ok", message: "Square or vertical, and within 3 minutes. That matches YouTube's Shorts shape." });
  } else if (!Number.isFinite(duration)) {
    items.push({ kind: "tip", message: "Couldn't read the length. Shorts are up to 3 minutes." });
  }
  return items;
}

export function readMp4Meta(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (buf.length < 16) return null;
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
  const moov = boxes(0, buf.length).find((box) => box.type === "moov");
  if (!moov) return null;
  const inner = boxes(moov.start, moov.end);
  const mvhd = inner.find((box) => box.type === "mvhd");
  let durationSec = null;
  if (mvhd && view.getUint8(mvhd.start) === 0 && mvhd.start + 20 <= mvhd.end) {
    const timescale = view.getUint32(mvhd.start + 12);
    const duration = view.getUint32(mvhd.start + 16);
    if (timescale) durationSec = duration / timescale;
  }
  let width = 0;
  let height = 0;
  for (const box of inner) {
    if (box.type !== "trak") continue;
    const tkhd = boxes(box.start, box.end).find((child) => child.type === "tkhd");
    if (!tkhd) continue;
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
