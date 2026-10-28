import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkNetwork } from "./desk/public/optimize.js";
import { INTERVIEW_NOTE, INTERVIEW_PROMPTS, interviewPrompt } from "./desk/public/interviewPrompts.js";

export { interviewPrompt };
import { mcpError } from "./errors.js";

export { INTERVIEW_NOTE, INTERVIEW_PROMPTS };

const AUDIO_LIMIT = 8 * 1024 * 1024;

export function interviewDir(root) {
  return join(root, "interviews");
}

export function publicInterview(profile) {
  const answers = profile?.interview?.answers || {};
  return {
    profile_id: profile?.id || "",
    name: profile?.name || profile?.id || "",
    voice_notes: String(profile?.voice_notes || ""),
    presets: profile?.presets || {},
    prompts: INTERVIEW_PROMPTS.map((row) => {
      const saved = answers[row.id] || {};
      return {
        id: row.id,
        prompt: row.prompt,
        text: String(saved.text || ""),
        has_audio: Boolean(saved.audio_file),
        audio_file: saved.audio_file || "",
      };
    }),
    updated_at: profile?.interview?.updated_at || "",
    note: INTERVIEW_NOTE,
  };
}

export function cleanAnswers(input) {
  const out = {};
  const source = input && typeof input === "object" ? input : {};
  for (const row of INTERVIEW_PROMPTS) {
    const value = source[row.id];
    if (!value || typeof value !== "object") continue;
    out[row.id] = { text: String(value.text || "").trim().slice(0, 4000) };
  }
  return out;
}

export function checksForPosts(posts) {
  return (Array.isArray(posts) ? posts : []).map((post) => ({
    platform: post.platform,
    post_id: post.id,
    items: checkNetwork({ platform: post.platform, post }),
  }));
}

export function writeInterviewAudio({ root, profileId, promptId, bytes, contentType }) {
  if (!interviewPrompt(promptId)) throw mcpError("invalid_prompt", "That interview question is not in the list.");
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!body.length || body.length > AUDIO_LIMIT) {
    throw mcpError("payload_too_large", "A recording must be between 1 byte and 8 MB.", 413);
  }
  const dir = interviewDir(root);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const filename = `${profileId}--${promptId}.webm`;
  writeFileSync(join(dir, filename), body, { mode: 0o600 });
  return {
    audio_file: filename,
    audio_content_type: String(contentType || "audio/webm").slice(0, 80) || "audio/webm",
    bytes: body.length,
  };
}

export function readInterviewAudio({ root, profile, promptId }) {
  const saved = profile?.interview?.answers?.[promptId];
  if (!saved?.audio_file) throw mcpError("not_found", "No recording is saved for that question.", 404);
  const file = join(interviewDir(root), saved.audio_file);
  return {
    bytes: readFileSync(file),
    content_type: saved.audio_content_type || "audio/webm",
  };
}
