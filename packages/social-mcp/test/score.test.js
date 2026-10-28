import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreText, scoreThumbnail, scoreContent, youtubeSuggest } from "../src/score/score.js";

const good = { title: "Resume tips: 5 mistakes that cost you interviews", description: "Resume tips for new grads. ".repeat(10), tags: ["resume tips", "resume", "jobs", "career", "interview"] };

test("strong text scores high, weak text gets plain feedback", async () => {
  const hi = await scoreText(good);
  assert.equal(hi.score, 100);
  const lo = await scoreText({ title: "Insane secret hack", tags: "x" });
  assert.ok(lo.score < 50, String(lo.score));
  assert.ok(lo.feedback.some((l) => /hype words/.test(l)));
  assert.ok(lo.feedback.some((l) => /Only 1 tag/.test(l)));
  assert.ok(lo.score >= 0 && lo.score <= 100);
});

test("search interest is off by default and uses only a read-only GET when on", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push([url, opts.method]); return { ok: true, text: async () => JSON.stringify(["resume tips", ["resume tips 2026", "resume tips for students"]]) }; };
  await scoreText(good, { fetchImpl });
  assert.equal(calls.length, 0);
  const r = await scoreText(good, { fetchImpl, interest: "youtube_suggest" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], "GET");
  assert.match(calls[0][0], /^https:\/\/suggestqueries\.google\.com\//);
  assert.equal(r.interest.suggestions.length, 2);
  assert.equal(r.score, 100, "interest is informational, not scored");
  assert.deepEqual(await youtubeSuggest("a", async () => ({ ok: false })), null);
});

test("thumbnail word count, contrast and small-size readability", () => {
  const flat = Buffer.alloc(64 * 36, 128);
  const r1 = scoreThumbnail({ text: "this has far too many words on it" }, { sample: flat });
  assert.ok(r1.score < 30);
  const busy = Buffer.alloc(64 * 36);
  for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) busy[y * 64 + x] = x < 32 ? 20 : 235;
  for (let i = 0; i < 64 * 36; i += 97) busy[i] = busy[i] > 100 ? 20 : 235;
  const r2 = scoreThumbnail({ text: "Fix your resume" }, { sample: busy });
  assert.ok(r2.score > r1.score);
  assert.ok(r2.feedback[0].includes("3 words"));
});

test("thumbnail path stays inside the media folder; missing ffmpeg degrades gracefully", () => {
  const root = mkdtempSync(join(tmpdir(), "pp-score-"));
  writeFileSync(join(root, "t.png"), "not an image");
  const r = scoreThumbnail({ media_path: "t.png" }, { mediaRoot: root, ffmpeg: "/nonexistent/ffmpeg" });
  assert.ok(r.feedback.some((l) => /wasn't checked/.test(l)));
  assert.throws(() => scoreThumbnail({ media_path: "../../etc/passwd" }, { mediaRoot: root }));
});

test("vidIQ score only comes from the user's own input; scorer never calls vidIQ", async () => {
  const urls = [];
  const fetchImpl = async (u) => { urls.push(u); return { ok: false }; };
  const a = await scoreContent(good, { fetchImpl });
  assert.equal(a.vidiq, null);
  assert.equal(a.informational, true);
  const b = await scoreContent({ ...good, vidiq_score: 73 }, { fetchImpl, interest: "youtube_suggest" });
  assert.deepEqual(b.vidiq, { score: 73, source: "your own vidIQ account" });
  assert.ok(urls.every((u) => !/vidiq/i.test(u)));
  const src = readFileSync(new URL("../src/score/score.js", import.meta.url), "utf8");
  assert.ok(!/vidiq\.com|api\.vidiq/i.test(src));
});

test("desk /api/score works without an owner PIN and UI has a Score it button", async () => {
  const { createEngine } = await import("../src/engine.js");
  const { createDeskServer } = await import("../src/desk/server.js");
  const html = readFileSync(new URL("../src/desk/public/index.html", import.meta.url), "utf8");
  assert.match(html, /id="score-it"[^>]*>Score it</);
  assert.ok(!/\bAI\b/.test(readFileSync(new URL("../src/desk/public/manage.js", import.meta.url), "utf8")));
  const home = mkdtempSync(join(tmpdir(), "pp-score-home-"));
  const engine = createEngine({ home, env: { SOCIAL_MCP_PUBLISH_MODE: "mock" } });
  const port = 47980 + Math.floor(Math.random() * 8);
  const desk = createDeskServer({ engine, env: { SOCIAL_MCP_DESK_PORT: String(port) }, port });
  await desk.start({ open: false });
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/score`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...good, thumbnail_text: "Fix it" }) }).then((x) => x.json());
    assert.equal(r.ok, true);
    assert.equal(r.text.score, 100);
    assert.ok(r.thumbnail.feedback.length >= 3);
    assert.equal(r.vidiq, null);
  } finally {
    await desk.stop();
  }
});
