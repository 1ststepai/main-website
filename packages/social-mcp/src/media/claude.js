import { execFile } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { mcpError } from "../errors.js";

function redactSecrets(text, secrets) {
  let out = String(text || "");
  for (const secret of secrets) {
    const value = String(secret || "");
    if (value.length > 4) out = out.split(value).join("••••");
  }
  return out;
}

const exec = promisify(execFile);

export const CLAUDE_MODEL = "claude-sonnet-4-5";

const CHECKS = [
  ["spec", "Spec fit"],
  ["brand", "On brand"],
  ["legibility", "Text legibility"],
  ["policy", "Policy"],
  ["match", "Caption match"],
];

export function cardKind(style, prompt) {
  const text = `${style || ""} ${prompt || ""}`.toLowerCase();
  if (text.includes("quote")) return "quote";
  if (text.includes("announce")) return "announcement";
  return "text";
}

export function sanitizeSvg(svg) {
  let text = String(svg || "");
  const start = text.indexOf("<svg");
  const end = text.lastIndexOf("</svg>");
  if (start < 0 || end < start) throw mcpError("invalid_card", "Claude did not return an SVG card.");
  text = text.slice(start, end + 6);
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "");
  if (!text.includes("<svg")) throw mcpError("invalid_card", "Claude did not return an SVG card.");
  return text;
}

export function cardSvg({ kind = "text", title = "", body = "", width = 1080, height = 1080 }) {
  const safe = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .slice(0, 280);
  const heading = safe(title || "PostPath");
  const copy = safe(body);
  const kicker = kind === "quote" ? "Quote" : kind === "announcement" ? "Announcement" : "Note";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#10233a"/>
  <rect x="48" y="48" width="${width - 96}" height="${height - 96}" rx="28" fill="none" stroke="#73def7" stroke-width="3"/>
  <text x="80" y="140" fill="#73def7" font-family="sans-serif" font-size="28">${kicker}</text>
  <text x="80" y="${Math.round(height * 0.42)}" fill="#f7f8ff" font-family="sans-serif" font-size="54">${heading}</text>
  <text x="80" y="${Math.round(height * 0.58)}" fill="#b2bed6" font-family="sans-serif" font-size="28">${copy}</text>
</svg>`;
}

export function mockCaptions(prompt, platforms = []) {
  const clean = String(prompt || "").replace(/\s+/g, " ").trim();
  const title = clean.split(" ").slice(0, 8).join(" ").slice(0, 100) || "Draft";
  const tags = ["postpath"];
  const networks = {};
  for (const platform of platforms) {
    networks[platform] = {
      title: title.slice(0, 100),
      caption: `${clean}\n\n${platform}`.trim().slice(0, 2200),
      tags,
    };
  }
  return { title, caption: clean.slice(0, 2200), tags, networks, provider: "mock", model: "mock-captions" };
}

export function mockReview({ prompt = "", captions = "" } = {}) {
  const short = String(captions || prompt).trim().length < 12;
  return {
    provider: "mock",
    model: "mock-review",
    advisory: true,
    summary: "Advisory notes only. Nothing was approved.",
    items: CHECKS.map(([id, label]) => ({
      id,
      label,
      status: id === "legibility" && short ? "warn" : "pass",
      detail:
        id === "legibility" && short
          ? "The caption is very short. Check that the words are readable on the card."
          : `${label} looks fine for a local mock. This is not an approval.`,
    })),
  };
}

function extractJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw mcpError("claude_response", "Claude did not return JSON.");
  return JSON.parse(body.slice(start, end + 1));
}

function clip(value, max) {
  return String(value || "").trim().slice(0, max);
}

function asTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return list.map((tag) => clip(tag, 40)).filter(Boolean).slice(0, 8);
}

export function normalizeCaptions(payload, platforms) {
  const networks = {};
  for (const platform of platforms) {
    const row = payload?.networks?.[platform] || {};
    networks[platform] = {
      title: clip(row.title || payload?.title, 100),
      caption: clip(row.caption || row.description || payload?.caption, 2200),
      tags: asTags(row.tags || payload?.tags),
    };
  }
  return {
    title: clip(payload?.title, 100),
    caption: clip(payload?.caption, 2200),
    tags: asTags(payload?.tags),
    networks,
    provider: "claude",
    model: clip(payload?.model, 80),
  };
}

export function normalizeReview(payload, model) {
  const items = CHECKS.map(([id, label]) => {
    const row = (payload?.items || []).find((item) => item?.id === id) || {};
    const status = row.status === "flag" || row.status === "warn" || row.status === "pass" ? row.status : "warn";
    return { id, label, status, detail: clip(row.detail, 400) || `${label} was not checked.` };
  });
  return {
    provider: "claude",
    model: model || CLAUDE_MODEL,
    advisory: true,
    summary: "Advisory notes only. Nothing was approved.",
    items,
  };
}

export async function claudeMessages({ key, fetchImpl, env, content }) {
  if (!key) throw mcpError("missing_media_key", "Add an Anthropic API key in the desk. The key stays on this computer.");
  const model = env?.ANTHROPIC_MODEL || CLAUDE_MODEL;
  let response;
  try {
    response = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1600,
        messages: [{ role: "user", content }],
      }),
    });
  } catch (error) {
    throw mcpError("claude_unavailable", redactSecrets(error?.message || "Claude could not be reached.", [key]));
  }
  const text = await response.text();
  if (!response.ok) {
    throw mcpError("claude_unavailable", redactSecrets(`Claude returned ${response.status}. ${text.slice(0, 240)}`, [key]));
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw mcpError("claude_response", "Claude returned a response PostPath could not read.");
  }
  const message = (payload?.content || []).map((block) => block?.text || "").join("\n");
  return { model: payload?.model || model, text: message };
}

export async function writeCaptions({ provider, prompt, platforms, presets, key, fetchImpl, env }) {
  if (provider === "mock") return mockCaptions(prompt, platforms);
  if (provider !== "claude") throw mcpError("unknown_provider", "Choose a caption writer, or write the captions yourself.");
  const brand = {
    platforms: presets?.platforms || [],
    hashtags: presets?.hashtags || [],
    footer: presets?.caption_footer || "",
    privacy: presets?.privacy_status || "private",
  };
  const { model, text } = await claudeMessages({
    key,
    fetchImpl,
    env,
    content: [
      {
        type: "text",
        text: `Write social captions as JSON only. Keys: title, caption, tags, networks. networks has one object per platform in ${JSON.stringify(platforms)} with title, caption, tags. Brand preset: ${JSON.stringify(brand)}. Prompt: ${prompt}. Do not include an API key. Do not say the post is approved.`,
      },
    ],
  });
  const parsed = extractJson(text);
  return { ...normalizeCaptions(parsed, platforms), model };
}

export async function reviewDraft({ provider, prompt, captions, presets, images = [], key, fetchImpl, env }) {
  if (provider === "mock" || provider === "none") return mockReview({ prompt, captions });
  const content = [
    {
      type: "text",
      text: `Review this draft. Return JSON only: {"items":[{"id":"spec|brand|legibility|policy|match","status":"pass|warn|flag","detail":"..."}]}. Advisory only. Do not approve it. Prompt: ${prompt}. Captions: ${captions}. Brand preset: ${JSON.stringify({ hashtags: presets?.hashtags || [], footer: presets?.caption_footer || "" })}.`,
    },
  ];
  for (const image of images.slice(0, 4)) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: image.media_type || "image/jpeg", data: image.data },
    });
    content.push({ type: "text", text: `Image for ${image.platform}.` });
  }
  const { model, text } = await claudeMessages({ key, fetchImpl, env, content });
  return normalizeReview(extractJson(text), model);
}

export async function designCard({ provider, prompt, style, width, height, key, fetchImpl, env }) {
  const kind = cardKind(style, prompt);
  if (provider === "mock") {
    return { svg: cardSvg({ kind, title: String(prompt || "").slice(0, 80), body: style || kind, width, height }), model: "mock-card", kind };
  }
  const { model, text } = await claudeMessages({
    key,
    fetchImpl,
    env,
    content: [
      {
        type: "text",
        text: `Design a ${kind} card at ${width}x${height}. Return JSON only with either an svg string or an html string, and kind. No script, no external images, no audio. Prompt: ${prompt}. Style: ${style || kind}.`,
      },
    ],
  });
  const parsed = extractJson(text);
  if (parsed.svg) return { svg: sanitizeSvg(parsed.svg), model, kind: parsed.kind || kind };
  const plain = String(parsed.html || parsed.text || prompt || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { svg: cardSvg({ kind: parsed.kind || kind, title: plain.slice(0, 80), body: plain.slice(80, 200), width, height }), model, kind };
}

export async function renderCardPng(svg, dest, { width, height }) {
  const sharp = (await import("sharp")).default;
  await sharp(Buffer.from(sanitizeSvg(svg))).resize(width, height, { fit: "fill" }).png().toFile(dest);
}

export async function jpegForReview(file) {
  const sharp = (await import("sharp")).default;
  const bytes = await sharp(file).resize(768, 768, { fit: "inside" }).jpeg({ quality: 70 }).toBuffer();
  return bytes.toString("base64");
}

export async function frameForReview(videoPath, dest) {
  await exec("ffmpeg", ["-y", "-ss", "0.2", "-i", videoPath, "-frames:v", "1", dest], { timeout: 20000 });
  return dest;
}

export async function reviewImages(assets, mediaDir) {
  const images = [];
  for (const [platform, asset] of Object.entries(assets || {})) {
    if (!asset?.path) continue;
    const file = join(mediaDir, asset.path);
    try {
      if (String(asset.content_type || "").startsWith("video/")) {
        const frame = join(mediaDir, `.review-${asset.path}.jpg`);
        await frameForReview(file, frame);
        images.push({ platform, media_type: "image/jpeg", data: await jpegForReview(frame) });
        rmSync(frame, { force: true });
      } else {
        images.push({ platform, media_type: "image/jpeg", data: await jpegForReview(file) });
      }
    } catch {
      images.push({ platform, media_type: "image/jpeg", data: "" });
    }
  }
  return images.filter((image) => image.data);
}

export function readLocalBase64(file) {
  return readFileSync(file).toString("base64");
}
