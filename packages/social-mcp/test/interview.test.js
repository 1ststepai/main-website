import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { scopeToBrand } from "../src/desk/public/brand.js";

test("interview drafts stay on that brand and are not published", async () => {
  const home = mkdtempSync(join(tmpdir(), "postpath-interview-"));
  let calls = 0;
  const engine = createEngine({
    home,
    env: { SOCIAL_MCP_PUBLISH_MODE: "mock", SOCIAL_MCP_OAUTH_PORT: "0" },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("network");
    },
  });
  try {
    await engine.upsertProfile({ id: "1ststep-ai", name: "1stStep.ai" });
    await engine.upsertProfile({ id: "swing-trade-pros", name: "Swing Trade Pros" });
    const saved = engine.saveInterview("1ststep-ai", {
      voice_notes: "Short sentences. Avoid the word hack.",
      answers: {
        week: { text: "Shipped the desk brand switcher." },
        tip: { text: "Write the caption before the title." },
      },
    });
    assert.equal(saved.voice_notes, "Short sentences. Avoid the word hack.");
    assert.equal(saved.prompts.find((row) => row.id === "week").text, "Shipped the desk brand switcher.");
    assert.match(saved.note, /does not transcribe/);
    const other = engine.getInterview("swing-trade-pros");
    assert.equal(other.voice_notes, "");
    assert.equal(other.prompts.every((row) => row.text === ""), true);

    engine.saveInterviewAudio("1ststep-ai", "week", Buffer.from("not-a-transcript"), "audio/webm");
    const withAudio = engine.getInterview("1ststep-ai");
    assert.equal(withAudio.prompts.find((row) => row.id === "week").has_audio, true);
    assert.equal(withAudio.prompts.find((row) => row.id === "week").text, "Shipped the desk brand switcher.");
    assert.equal(withAudio.prompts.find((row) => row.id === "tip").has_audio, false);

    const created = await engine.createDraftsFromInterview({
      profile_id: "1ststep-ai",
      posts: [
        {
          platforms: ["youtube", "instagram"],
          title: "Base title",
          caption: "Base caption",
          overrides: {
            youtube: { title: "Short title", hashtags: ["Shorts"] },
            instagram: { caption: "IG only", hashtags: ["one"] },
          },
        },
        {
          platforms: ["instagram"],
          title: "Hashtags",
          caption: "#one #two #three #four #five #six",
        },
      ],
    });
    assert.equal(created.published, false);
    assert.equal(calls, 0);
    const first = created.drafts[0];
    const youtube = first.posts.find((post) => post.platform === "youtube");
    const instagram = first.posts.find((post) => post.platform === "instagram");
    assert.equal(youtube.status, "draft");
    assert.equal(youtube.source, "interview");
    assert.equal(youtube.profile_id, "1ststep-ai");
    assert.equal(youtube.title, "Short title");
    assert.match(youtube.description, /#Shorts/);
    assert.match(instagram.caption, /^IG only/);
    assert.match(instagram.caption, /#one/);
    assert.equal(first.bundle.caption, "Base caption");
    const tagRule = created.drafts[1].checks
      .find((row) => row.platform === "instagram")
      .items.find((item) => item.kind === "rule" && /5 tags/i.test(item.message));
    assert.ok(tagRule);
    assert.equal(created.drafts[1].posts[0].status, "draft");

    const queue = engine.listQueue().queue;
    assert.equal(scopeToBrand(queue, "swing-trade-pros").length, 0);
    assert.equal(scopeToBrand(queue, "1ststep-ai").length, 2);
    assert.ok(scopeToBrand(queue, "1ststep-ai").every((row) => row.source === "interview"));
  } finally {
    await engine.oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});
