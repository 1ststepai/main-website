import { claudeMessages } from "../media/claude.js";
import { keywordsFor } from "../seo/keywords.js";
import { guardHook } from "./originality.js";
import { voiceFor } from "./voice.js";
import { attachHook } from "./attach.js";

function structureForPrompt(structure) {
  if (!structure) return null;
  const next = {
    opening_type: structure.structure?.opening_type || structure.opening_type,
    pattern: structure.structure?.pattern || structure.pattern,
    visual_surprise: structure.structure?.visual_surprise || structure.visual_surprise,
    pacing: structure.structure?.pacing || structure.pacing,
    delivery: structure.structure?.delivery || structure.delivery,
    promise: structure.structure?.promise || structure.promise,
  };
  return next;
}

function normalizeHook(raw, borrowed) {
  const beats = Array.isArray(raw?.beats)
    ? raw.beats.slice(0, 8).map((beat) => ({
        t: String(beat?.t || beat?.at || "").slice(0, 8),
        text: String(beat?.text || beat?.do || "").slice(0, 160),
      }))
    : [];
  return {
    spoken: String(raw?.spoken || "").trim().slice(0, 400),
    on_screen_text: String(raw?.on_screen_text || "").trim().slice(0, 80),
    shot: String(raw?.shot || "").trim().slice(0, 400),
    beats,
    why: String(raw?.why || "").trim().slice(0, 400),
    borrowed_from: borrowed,
  };
}

async function claudeHooks(ctx, { topic, voice, structure, avoid }) {
  const key = String(ctx.env.ANTHROPIC_API_KEY || "").trim();
  const { text } = await claudeMessages({
    key,
    fetchImpl: ctx.fetchImpl,
    env: ctx.env,
    content: [
      {
        type: "text",
        text: `Write 3 original 10-second openings as JSON only: {"hooks":[{"spoken":"","on_screen_text":"","shot":"","beats":[{"t":"0s","text":""}],"why":""}]}.
Topic: ${topic}.
Use this structure, not any source sentence: ${JSON.stringify(structure)}.
Brand voice fields that are blank are unknown. Do not invent a biography, a catchphrase, or a promise of results. Voice: ${JSON.stringify(voice)}.
Do not use these words: ${JSON.stringify(avoid)}.
The person films this themselves. Do not copy five or more words in a row from a title or description. Do not include a transcript.`,
      },
    ],
  });
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  const parsed = JSON.parse(text.slice(start, end + 1));
  return Array.isArray(parsed.hooks) ? parsed.hooks : [];
}

export async function generateHooks(ctx, input = {}) {
  const topic = String(input.topic || "").trim().slice(0, 120);
  const profileId = String(input.profile_id || "").trim();
  const videoId = String(input.video_id || "").trim();
  const stored = videoId ? ctx.store.readSeo().structures?.[videoId] : null;
  const structure = structureForPrompt(input.structure || stored);
  if (!structure?.pattern && !structure?.opening_type) {
    return { mode: "needs_structure", hooks: [], message: "Capture an opening structure first." };
  }
  const voice = voiceFor(ctx.store, profileId);
  const brand = profileId ? keywordsFor(ctx.store, profileId, new Date(ctx.now()).toISOString()) : null;
  const avoid = [...(voice.avoid || []), ...(brand?.negative || [])];
  const borrowed = [
    {
      video_id: stored?.video_id || videoId,
      url: stored?.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ""),
      title: stored?.title || String(input.title || ""),
    },
  ].filter((row) => row.video_id || row.title);
  const sources = [stored?.title, input.title, input.source_description, stored?.fragment, input.fragment].filter(Boolean);
  let raw = [];
  let mode = "needs_key";
  if (typeof ctx.hookGenerator === "function") {
    raw = await ctx.hookGenerator({ topic, voice, structure, avoid, borrowed });
    mode = "mock";
  } else if (Array.isArray(input.hooks) && input.hooks.length) {
    raw = input.hooks;
    mode = "assistant";
  } else if (String(ctx.env.ANTHROPIC_API_KEY || "").trim()) {
    try {
      raw = await claudeHooks(ctx, { topic, voice, structure, avoid });
      mode = "claude";
    } catch (error) {
      return { mode: "claude_unavailable", hooks: [], message: error.message || "Claude did not write openings.", voice_todo: voice.todo };
    }
  } else {
    return {
      mode: "needs_key",
      hooks: [],
      voice_todo: voice.todo,
      structure,
      borrowed_from: borrowed,
      message: "Add an Anthropic key, or send three openings to check. PostPath will not invent them.",
    };
  }
  const checked = (Array.isArray(raw) ? raw : []).slice(0, 6).map((row) => guardHook(normalizeHook(row, borrowed), sources));
  const hooks = checked.filter((row) => !row.rejected).slice(0, 3);
  const rejected = checked.filter((row) => row.rejected).length;
  let attached = null;
  const pick = Number(input.pick);
  if (input.draft_id && Number.isInteger(pick) && hooks[pick - 1]) {
    attached = attachHook(ctx, { draft_id: input.draft_id, hook: hooks[pick - 1], topic });
  }
  return {
    mode,
    topic,
    hooks,
    rejected,
    borrowed_from: borrowed,
    voice_todo: voice.todo,
    attached,
    auto_approve: false,
    message: hooks.length ? "These are original openings. Nothing is approved." : "No opening passed the copy check.",
  };
}
