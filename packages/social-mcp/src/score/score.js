/**
 * PostPath's free built-in scorer. On demand only, informational only: nothing here blocks saving or approval.
 * It needs no vidIQ account. A user's own vidIQ score can be attached when they pass one in; PostPath
 * never calls vidIQ itself, so nobody's scoring runs through the owner's vidIQ account.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, isAbsolute } from "node:path";
import { resolveSafeMediaPath } from "../mediaPath.js";
import { scoreTitle } from "./title.js";

export const HYPE_WORDS = [
  "guaranteed", "guarantee", "insane", "shocking", "unbelievable", "secret", "hack", "hacks", "best ever", "mind-blowing", "mind blowing",
  "you won't believe", "game changer", "game-changer", "100%", "instantly", "overnight", "get rich", "explode", "viral", "crazy", "must see", "must-see",
  "life-changing", "life changing", "ultimate", "jaw-dropping", "epic",
];
const STOP = new Set("a an and are as at be by for from how i in is it my of on or our so that the this to was we what when why with you your".split(" "));
const HOOK = /^(\d|how\b|why\b|what\b|stop\b|don't\b|do\s+this|the\s+one\b|before\b|i\s+tried\b|\w+\s+mistakes?\b)|\?$|\b(you|your)\b/i;

function words(text) {
  return String(text || "").toLowerCase().match(/[a-z0-9][a-z0-9'+-]*/g) || [];
}

function pickKeyword({ keyword, title, tags }) {
  if (keyword) return String(keyword).trim().toLowerCase();
  if (tags?.length) return String(tags[0]).trim().toLowerCase();
  const candidates = words(title).filter((w) => !STOP.has(w) && w.length > 2);
  return candidates.sort((a, b) => b.length - a.length)[0] || "";
}

function hypeFound(text) {
  const lower = String(text || "").toLowerCase();
  return HYPE_WORDS.filter((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(lower));
}

/** YouTube search-suggest lookup. Read-only GET; off unless the caller asks for it. */
export async function youtubeSuggest(keyword, fetchImpl = fetch) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(keyword)}`;
  const response = await fetchImpl(url, { method: "GET" });
  if (!response.ok) return null;
  const body = JSON.parse(await response.text());
  return Array.isArray(body?.[1]) ? body[1].slice(0, 10) : null;
}

/**
 * Score a title, description and tags. Returns { score 0-100, feedback[], checks[], keyword }.
 * options.interest: "off" (default) | "youtube_suggest" | "google_trends" (needs options.trends(keyword)).
 */
export async function scoreText(input = {}, { fetchImpl = fetch, interest = "off", trends } = {}) {
  const title = String(input.title || "").trim();
  const description = String(input.description || "").trim();
  const tags = (Array.isArray(input.tags) ? input.tags : String(input.tags || "").split(",")).map((t) => String(t).trim()).filter(Boolean);
  const keyword = pickKeyword({ keyword: input.keyword || input.main_term, title, tags });
  const checks = [];
  const add = (id, weight, pass, line, partial = pass ? 1 : 0) => checks.push({ id, weight, pass, points: Math.round(weight * partial), line });

  const len = title.length;
  if (!title) add("title_length", 15, false, "Add a title.");
  else if (len >= 30 && len <= 70) add("title_length", 15, true, `Title length is good (${len} characters).`);
  else if (len < 30) add("title_length", 15, false, `Title is short (${len} characters). Aim for 30-70 so it explains the video.`, 0.5);
  else add("title_length", 15, false, `Title is long (${len} characters). Keep the key idea in the first 70; the rest is cut off on most screens.`, 0.5);

  const pos = keyword ? title.toLowerCase().indexOf(keyword) : -1;
  if (!keyword) add("front_keyword", 15, false, "Pick a main keyword (or add tags) so the title can lead with it.");
  else if (pos >= 0 && pos <= 30) add("front_keyword", 15, true, `Keyword "${keyword}" is near the start of the title.`);
  else if (pos > 30) add("front_keyword", 15, false, `Move "${keyword}" closer to the start of the title.`, 0.5);
  else add("front_keyword", 15, false, `The title doesn't include "${keyword}". Put it in the first few words.`);

  const firstLine = description.split(/\n/)[0] || "";
  const hook = HOOK.test(title) || HOOK.test(firstLine);
  add("hook", 15, hook, hook ? "There's a clear hook (a number, question, or direct \"you\")." : "Add a hook: a number, a question, or speak to the viewer directly.");

  const hype = hypeFound(`${title} ${description} ${tags.join(" ")}`);
  add("no_hype", 15, !hype.length, hype.length ? `Drop hype words: ${hype.join(", ")}. Plain, specific words build trust.` : "No hype words. Good.");

  const inDesc = keyword && description.toLowerCase().slice(0, 250).includes(keyword);
  const anywhereDesc = keyword && description.toLowerCase().includes(keyword);
  add("keyword_description", 15, Boolean(inDesc), !description ? "Add a description that opens with what the video covers." : inDesc ? "Keyword appears early in the description." : anywhereDesc ? "Mention the keyword in the first two lines of the description." : `Add "${keyword}" to the first two lines of the description.`, inDesc ? 1 : anywhereDesc ? 0.5 : 0);

  const inTags = keyword && tags.some((t) => t.toLowerCase().includes(keyword));
  add("keyword_tags", 10, Boolean(inTags), inTags ? "Keyword is in your tags." : `Add "${keyword || "your main keyword"}" as a tag.`);

  const count = tags.length;
  const goodCount = count >= 5 && count <= 15;
  add("tag_count", 10, goodCount, goodCount ? `${count} tags. Good range.` : count < 5 ? `Only ${count} tag${count === 1 ? "" : "s"}. Add a few close variations (5-15 total).` : `${count} tags is a lot. Keep the 15 most relevant.`, goodCount ? 1 : count > 0 ? 0.5 : 0);

  const descOk = description.length >= 200;
  add("description_length", 5, descOk, descOk ? "Description has enough detail." : "Write at least two or three sentences in the description.", descOk ? 1 : description ? 0.5 : 0);

  let interestResult = null;
  if (keyword && interest === "youtube_suggest") {
    try {
      const suggestions = await youtubeSuggest(keyword, fetchImpl);
      interestResult = { source: "youtube_suggest", suggestions: suggestions || [] };
      checks.push({ id: "search_interest", weight: 0, pass: Boolean(suggestions?.length), points: 0, line: suggestions?.length ? `People search for this on YouTube, for example: ${suggestions.slice(0, 3).join("; ")}.` : "YouTube shows few searches for this keyword. Try a more common phrase." });
    } catch {
      interestResult = { source: "youtube_suggest", error: "lookup_failed" };
    }
  } else if (keyword && interest === "google_trends" && typeof trends === "function") {
    try {
      interestResult = { source: "google_trends", ...(await trends(keyword)) };
      checks.push({ id: "search_interest", weight: 0, pass: true, points: 0, line: "Google Trends interest attached." });
    } catch {
      interestResult = { source: "google_trends", error: "lookup_failed" };
    }
  }

  const total = checks.reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round((checks.reduce((sum, c) => sum + c.points, 0) / total) * 100);
  return { score, keyword, feedback: checks.map((c) => c.line), checks, interest: interestResult };
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;

// Only the ffmpeg program itself may run: the bare name "ffmpeg" (found on PATH) or an
// absolute path whose file name is ffmpeg / ffmpeg.exe. Anything else is refused.
export function safeFfmpegBinary(value = "ffmpeg") {
  const bin = String(value || "");
  if (bin === "ffmpeg") return bin;
  if (!bin.includes("\0") && isAbsolute(bin) && /^ffmpeg(\.exe)?$/i.test(basename(bin))) return bin;
  throw new Error("ffmpeg binary is not allowed.");
}

// ffmpeg's argv is a constant: the image is piped in on stdin, so no user-derived
// value ever reaches the command line. The path is still checked (absolute, image
// extension, no NUL) before the file is read.
export const THUMBNAIL_ARGS = Object.freeze(["-nostdin", "-v", "error", "-i", "pipe:0", "-frames:v", "1", "-vf", "scale=64:36,format=gray", "-f", "rawvideo", "pipe:1"]);
const MAX_THUMBNAIL_BYTES = 20 * 1024 * 1024;
export function assertThumbnailPath(file) {
  const path = String(file || "");
  if (!isAbsolute(path) || path.includes("\0") || !IMAGE_EXT.test(path)) throw new Error("Thumbnail path is not allowed.");
  return path;
}

/** Thumbnail: text word count, contrast, and readability at small size (via ffmpeg, if installed). */
export function scoreThumbnail({ media_path, text = "" } = {}, { mediaRoot, ffmpeg = "ffmpeg", sample } = {}) {
  const checks = [];
  const add = (id, weight, pass, line, partial = pass ? 1 : 0) => checks.push({ id, weight, pass, points: Math.round(weight * partial), line });
  const count = words(text).length;
  if (!text) add("text_words", 30, true, "No text on the thumbnail given. If you add text, keep it to 1-4 words.", 0.7);
  else if (count <= 4) add("text_words", 30, true, `${count} word${count === 1 ? "" : "s"} of text. Easy to read.`);
  else if (count <= 6) add("text_words", 30, false, `${count} words of text. Cut to 4 or fewer.`, 0.5);
  else add("text_words", 30, false, `${count} words is too many for a thumbnail. Cut to 4 or fewer.`);

  let pixels = sample || null;
  if (!pixels && media_path) {
    const file = resolveSafeMediaPath(media_path, mediaRoot);
    try {
      // 64x36 grayscale: roughly how the image reads in a phone's search list.
      const image = readFileSync(assertThumbnailPath(file));
      if (image.length > MAX_THUMBNAIL_BYTES) throw new Error("Thumbnail is too large to check.");
      pixels = execFileSync(safeFfmpegBinary(ffmpeg), THUMBNAIL_ARGS, { input: image, maxBuffer: 1 << 20, timeout: 10_000, shell: false });
    } catch {
      pixels = null;
    }
  }
  if (!pixels?.length) {
    add("contrast", 35, false, "Couldn't read the image here, so contrast wasn't checked.", 0);
    add("small_size", 35, false, "Couldn't check readability at small size.", 0);
  } else {
    const values = [...pixels];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    const contrast = sd >= 50 ? 1 : sd >= 30 ? 0.6 : 0.2;
    add("contrast", 35, contrast === 1, contrast === 1 ? "Strong contrast." : contrast > 0.5 ? "Contrast is okay. Brighter text on a darker background (or the reverse) would pop more." : "Low contrast. It will look flat in a feed; separate the subject from the background.", contrast);
    let edges = 0;
    const w = 64;
    for (let i = 0; i < values.length - 1; i += 1) if ((i + 1) % w && Math.abs(values[i] - values[i + 1]) > 40) edges += 1;
    const density = edges / values.length;
    const readable = density > 0.02 && density < 0.25 ? 1 : density <= 0.02 ? 0.4 : 0.5;
    add("small_size", 35, readable === 1, readable === 1 ? "Reads clearly at small size." : density <= 0.02 ? "Very little detail at small size. Make the subject or text bigger." : "Busy at small size. Use fewer elements and bigger text.", readable);
  }
  const total = checks.reduce((sum, c) => sum + c.weight, 0);
  return { score: Math.round((checks.reduce((sum, c) => sum + c.points, 0) / total) * 100), feedback: checks.map((c) => c.line), checks };
}

/** One call for the desk and MCP. A user's own vidIQ score is attached only if they passed it in. */
export async function scoreContent(input = {}, options = {}) {
  const out = { informational: true, label: "Checklist score with tips", note: "Checklist scores with tips. A guide only, not a prediction and not a vidIQ score. Nothing is blocked." };
  if (input.title) {
    const suggest = options.interest === "youtube_suggest" ? (q) => youtubeSuggest(q, options.fetchImpl || fetch) : null;
    const trends = options.interest === "google_trends" && typeof options.trendsRel === "function" ? options.trendsRel : null;
    out.title = await scoreTitle(input.title, { fetcher: suggest, trends });
  }
  if (input.title || input.description || input.tags) out.text = await scoreText(input, options);
  if (input.thumbnail_path || input.thumbnail_text) out.thumbnail = scoreThumbnail({ media_path: input.thumbnail_path, text: input.thumbnail_text }, options);
  const vidiq = Number(input.vidiq_score);
  out.vidiq = Number.isFinite(vidiq) && input.vidiq_score !== undefined && input.vidiq_score !== null && input.vidiq_score !== "" ? { score: Math.max(0, Math.min(100, Math.round(vidiq))), source: "your own vidIQ account" } : null;
  if (!out.text && !out.thumbnail) out.text = await scoreText(input, options);
  return out;
}
