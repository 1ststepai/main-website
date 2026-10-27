import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { createDeskServer } from "../src/desk/server.js";
import {
  AI_NOT_IN_APP,
  PUBLISH_NOT_IN_GUIDE,
  SCHEDULE_NOT_IN_GUIDE,
  SUGGESTED_PREPARE_VIDEO,
  YOUTUBE_APP_MISSING,
  connectPlan,
  dismissGuide,
  draftRequest,
  emptyGuide,
  goBack,
  goNext,
  leaveBlocker,
  loadGuide,
  profileFor,
  reopenGuide,
  resultFromSaves,
  reviewView,
  saveGuide,
  shouldAutoOpen,
  skipGuide,
  suggestedRequests,
  toggleChannel,
} from "../src/desk/public/guide.js";

function memoryStorage(initial = null) {
  const values = new Map();
  if (initial) values.set("postpath.guide.v1", initial);
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("first launch opens the guide and skipping keeps the answers for later", () => {
  assert.equal(shouldAutoOpen(null), true);
  const storage = memoryStorage();
  assert.equal(loadGuide(storage), null);
  let guide = { ...emptyGuide(), intent: "video", step: "channels", channels: ["youtube"], title: "Desk check" };
  guide = skipGuide(guide);
  saveGuide(storage, guide);
  const loaded = loadGuide(storage);
  assert.equal(shouldAutoOpen(loaded), false);
  assert.equal(loaded.skipped, true);
  assert.equal(loaded.intent, "video");
  assert.equal(loaded.title, "Desk check");
  assert.deepEqual(loaded.channels, ["youtube"]);
  const resumed = reopenGuide(loaded);
  assert.equal(shouldAutoOpen(resumed), true);
  assert.equal(resumed.step, "channels");
  assert.equal(resumed.title, "Desk check");
});

test("resume returns to the saved step and does not ask for a known profile", () => {
  const storage = memoryStorage();
  let guide = goNext({ ...emptyGuide(), intent: "video" }, { hasProfile: true });
  guide = toggleChannel(guide, "youtube");
  guide = { ...guide, profileName: "" };
  assert.equal(leaveBlocker(guide, { hasProfile: true }), "");
  guide = goNext(guide, { hasProfile: true });
  assert.equal(guide.step, "content");
  saveGuide(storage, guide);
  const loaded = loadGuide(storage);
  assert.equal(loaded.step, "content");
  const known = profileFor(loaded, { profiles: [{ id: "acme", name: "Acme Co" }] });
  assert.equal(known.known, true);
  assert.equal(known.id, "acme");
  assert.equal(leaveBlocker({ ...loaded, step: "channels", channels: ["youtube"] }, { hasProfile: false }), "Name this profile. PostPath does not have one yet.");
});

test("youtube connect is blocked until a google app exists", () => {
  const blocked = connectPlan("youtube", { oauth_ready: { google: false }, connections: [] });
  assert.equal(blocked.action, "blocked");
  assert.equal(blocked.message, YOUTUBE_APP_MISSING);
  const ready = connectPlan("youtube", { oauth_ready: { google: true }, connections: [] });
  assert.equal(ready.action, "oauth");
  assert.deepEqual(ready.platforms, ["youtube"]);
  const connected = connectPlan("youtube", {
    connections: [{ platform: "youtube", account_label: "Swing Trade Pros" }],
  });
  assert.equal(connected.action, "connected");
  assert.match(connected.message, /Swing Trade Pros/);
  assert.equal(connectPlan("snapchat", {}).action, "unavailable");
  assert.equal(connectPlan("whatsapp", {}).action, "unavailable");
  assert.equal(connectPlan("tiktok", {}).action, "unavailable");
  assert.equal(connectPlan("bluesky", {}).action, "bluesky");
});

test("review shows the draft facts and refuses to save a video with no file", () => {
  const guide = {
    ...emptyGuide(),
    step: "review",
    intent: "video",
    channels: ["youtube"],
    title: "PostPath private connection test",
    description: "Private upload check.",
    creation: "manual",
    filename: "clip.mp4",
  };
  const missing = reviewView(guide, { connections: [] }, { hasFile: false });
  assert.equal(missing.canSave, false);
  assert.match(missing.blockers[0], /Choose the video file/);
  assert.equal(missing.privacy, "Private");
  assert.equal(missing.timing, SCHEDULE_NOT_IN_GUIDE);
  assert.equal(missing.publish, PUBLISH_NOT_IN_GUIDE);
  assert.equal(missing.accounts[0].account, "Not connected");

  const ready = reviewView(guide, { connections: [{ platform: "youtube", account_label: "Swing Trade Pros" }] }, { hasFile: true });
  assert.equal(ready.canSave, true);
  assert.equal(ready.accounts[0].account, "Swing Trade Pros");
  assert.equal(ready.filename, "clip.mp4");
  const request = draftRequest(ready.plans[0], { id: "acme", name: "Acme Co" }, "clip.mp4");
  assert.equal(request.privacy_status, "private");
  assert.equal(request.platform, "youtube");
  assert.equal(request.media_path, "clip.mp4");
  assert.equal("publish" in request, false);
});

test("suggested requests stay outside PostPath and failure results are not success", () => {
  const guide = { ...emptyGuide(), intent: "video", filename: "clip.mp4", creation: "ai" };
  const requests = suggestedRequests(guide, { connections: [], cursor: { installed: false } });
  assert.equal(requests[0].text, SUGGESTED_PREPARE_VIDEO);
  assert.equal(requests[0].runsInPostPath, false);
  assert.match(requests[0].note, /will not post anywhere/);
  assert.match(AI_NOT_IN_APP, /does not write the post/);
  const failed = resultFromSaves([{ ok: false, message: "Choose the video file." }]);
  assert.equal(failed.ok, false);
  assert.match(failed.message, /Choose the video file/);
  const saved = resultFromSaves([
    { ok: true, post: { id: "post_1", status: "draft", privacy_status: "private", platform: "youtube" } },
  ]);
  assert.equal(saved.ok, true);
  assert.match(saved.message, /not published/);
  assert.equal(resultFromSaves([{ ok: true, post: { id: "post_1", status: "published" } }]).ok, false);
});

test("back and dismiss do not drop the draft the user already entered", () => {
  let guide = { ...emptyGuide(), step: "content", intent: "post", title: "Hello", channels: ["bluesky"] };
  guide = goBack(guide);
  assert.equal(guide.step, "channels");
  assert.equal(guide.title, "Hello");
  guide = dismissGuide(guide);
  assert.equal(guide.open, false);
  assert.equal(guide.title, "Hello");
});

test("desk save from the guide payload stays a private draft and connect fails closed", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-guide-"));
  const env = { SOCIAL_MCP_OAUTH_PORT: "47994", SOCIAL_MCP_DESK_PORT: "47993" };
  const engine = createEngine({ home, env });
  const desk = createDeskServer({ engine, env, port: 47993 });
  try {
    const { url } = await desk.start({ open: false });
    const plan = reviewView(
      {
        ...emptyGuide(),
        intent: "post",
        channels: ["bluesky"],
        title: "Guide draft",
        description: "Saved from the guide test.",
        creation: "manual",
      },
      {},
      { hasFile: false },
    ).plans[0];
    const draft = await fetch(`${url}api/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draftRequest(plan, { id: "acme", name: "Acme Co" })),
    }).then((res) => res.json());
    assert.equal(draft.ok, true);
    assert.equal(draft.post.status, "draft");
    assert.equal(draft.post.privacy_status, "private");
    assert.equal(draft.post.published_url, null);
    const connect = await fetch(`${url}api/connect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "acme", name: "Acme Co", platforms: ["youtube"] }),
    }).then((res) => res.json());
    assert.equal(connect.ok, false);
    assert.equal(connect.code, "oauth_not_configured");
  } finally {
    await desk.stop();
    rmSync(home, { recursive: true, force: true });
  }
});
