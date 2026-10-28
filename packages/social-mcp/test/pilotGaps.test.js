import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createEngine } from "../src/engine.js";
import { initPilot, draftsCreate } from "../src/cli.js";
import { createSocialMcpServer } from "../src/mcp/server.js";
import { buildSocialMcpServerEntry } from "../src/cursorConfig.js";
import { containsBannedPromise, templateCaptions, INSTAGRAM_HASHTAGS } from "../src/pilot/captions.js";
import { insuranceOpenEnrollmentPilot } from "../src/pilot/example.js";
import { editPilotCaption, generateFromTopic, pilotQueue, queueApproved, regeneratePilot } from "../src/pilot/loop.js";

const PILOT_ENV = { SOCIAL_MCP_PILOT_MODE: "1", SOCIAL_MCP_DRAFT_ONLY: "1", SOCIAL_MCP_PUBLISH_MODE: "live", ANTHROPIC_API_KEY: "", SOCIAL_MCP_OAUTH_PORT: "0" };
const homeDir = () => mkdtempSync(path.join(tmpdir(), "postpath-gaps-"));

test("install-cursor pilot entry carries the home actually in use", () => {
  const home = path.join(tmpdir(), "Broker Home");
  const entry = buildSocialMcpServerEntry({ pilot: true, home });
  assert.equal(entry.env.SOCIAL_MCP_HOME, path.resolve(home));
  assert.equal(entry.env.SOCIAL_MCP_PILOT_MODE, "1");
  const relative = buildSocialMcpServerEntry({ pilot: true, home: "rel-home" });
  assert.equal(relative.env.SOCIAL_MCP_HOME, path.resolve("rel-home"));
  assert.equal(buildSocialMcpServerEntry({}).env?.SOCIAL_MCP_HOME, undefined);
});

test("MCP and CLI drafts show in the pilot queue and approve as queue-only", async () => {
  const home = homeDir();
  try {
    initPilot({ home, pin: "246810", env: PILOT_ENV });
    const engine = createEngine({ home, env: PILOT_ENV, publishers: {} });
    const { server } = createSocialMcpServer({ engine, env: PILOT_ENV });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const mcp = await client.callTool({
      name: "create_draft",
      arguments: { profile_id: "broker", platform: "facebook", title: "From MCP", caption: "Bring your current card to the review." },
    });
    assert.notEqual(mcp.isError, true, JSON.stringify(mcp.content));
    await client.close();

    await draftsCreate({ home, env: PILOT_ENV, args: ["--profile", "broker", "--platform", "linkedin", "--caption", "CLI caption about the document list."] });

    const fresh = createEngine({ home, env: PILOT_ENV });
    const queue = pilotQueue(fresh);
    const sources = queue.map((item) => item.source).sort();
    assert.ok(sources.includes("mcp"), JSON.stringify(sources));
    assert.ok(sources.includes("cli"), JSON.stringify(sources));
    for (const item of queue) {
      assert.equal(item.can_regenerate, false);
      const ref = item.kind === "post" ? { post_id: item.id } : { bundle_id: item.id };
      const queued = queueApproved(fresh, ref);
      assert.equal(queued.publishers_called, 0);
    }
    const after = pilotQueue(fresh);
    assert.ok(after.every((item) => item.status === "approved" && item.queue_label === "approved, waiting to post"));
    assert.equal(fresh.publisherCalls(), 0);
    for (const post of fresh.store.listPosts()) assert.equal(post.scheduled_at ?? null, null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("template captions differ per network and never promise rates or savings", () => {
  const config = insuranceOpenEnrollmentPilot();
  const banner = config.compliance_banner;
  for (const goal of config.goals) {
    for (const topic of goal.topics) {
      const out = templateCaptions({ topic, goal, platforms: ["facebook", "instagram", "linkedin", "youtube"], banner, config });
      const fb = out.networks.facebook.caption;
      const ig = out.networks.instagram.caption;
      const li = out.networks.linkedin.caption;
      assert.equal(new Set([fb, ig, li, out.networks.youtube.caption]).size, 4, topic.id);
      assert.ok(fb.length > ig.length, `${topic.id}: facebook should be longer`);
      assert.ok(ig.includes(INSTAGRAM_HASHTAGS), topic.id);
      assert.ok(!fb.includes("#openenrollment") && !li.includes("#openenrollment"), topic.id);
      assert.match(li, /Key points:/);
      for (const caption of [fb, ig, li, out.networks.youtube.caption]) {
        assert.ok(caption.includes(banner), topic.id);
        assert.equal(containsBannedPromise(caption), false, caption);
      }
    }
  }
});

test("regenerate keeps inline edits unless the broker says replace", async () => {
  const home = homeDir();
  try {
    initPilot({ home, pin: "246810", env: PILOT_ENV });
    const engine = createEngine({ home, env: PILOT_ENV, publishers: {} });
    const created = await generateFromTopic(engine, { goal_id: "quote_requests", topic_id: "gather-documents" }, { env: { ANTHROPIC_API_KEY: "" } });
    editPilotCaption(engine, { bundle_id: created.bundle.id, platform: "linkedin", caption: "My own LinkedIn words." });
    const liId = created.bundle.child_ids.linkedin;
    const fbBefore = engine.store.getPost(created.bundle.child_ids.facebook).caption;
    engine.store.getPost(created.bundle.child_ids.facebook);

    const kept = await regeneratePilot(engine, { bundle_id: created.bundle.id }, { env: { ANTHROPIC_API_KEY: "" } });
    assert.deepEqual(kept.kept_edits, ["linkedin"]);
    assert.match(engine.store.getPost(liId).caption, /My own LinkedIn words/);
    assert.equal(pilotQueue(engine).find((item) => item.id === created.bundle.id).networks.find((n) => n.platform === "linkedin").edited, true);
    assert.ok(engine.store.getPost(created.bundle.child_ids.facebook).caption.length > 0);
    assert.ok(fbBefore);

    const replaced = await regeneratePilot(engine, { bundle_id: created.bundle.id, replace_edits: true }, { env: { ANTHROPIC_API_KEY: "" } });
    assert.deepEqual(replaced.kept_edits, []);
    assert.doesNotMatch(engine.store.getPost(liId).caption, /My own LinkedIn words/);
    assert.match(engine.store.getPost(liId).caption, /Key points:/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-cursor --pilot CLI writes SOCIAL_MCP_HOME into the Cursor entry", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { readFileSync } = await import("node:fs");
  const work = homeDir();
  try {
    const dataHome = path.join(work, "data home");
    const binPath = new URL("../bin/social-mcp.js", import.meta.url).pathname;
    await promisify(execFile)(process.execPath, [binPath, "install-cursor", "--pilot"], {
      env: { ...process.env, HOME: work, USERPROFILE: work, CURSOR_MCP_CONFIG: "", SOCIAL_MCP_HOME: dataHome },
    });
    const config = JSON.parse(readFileSync(path.join(work, ".cursor", "mcp.json"), "utf8"));
    const entry = Object.values(config.mcpServers)[0];
    assert.equal(entry.env.SOCIAL_MCP_HOME, dataHome);
    assert.equal(entry.env.SOCIAL_MCP_PILOT_MODE, "1");
    const flagged = path.join(work, "flag-home");
    await promisify(execFile)(process.execPath, [binPath, "install-cursor", "--pilot", "--home", flagged], {
      env: { ...process.env, HOME: work, USERPROFILE: work, CURSOR_MCP_CONFIG: "", SOCIAL_MCP_HOME: "" },
    });
    const again = Object.values(JSON.parse(readFileSync(path.join(work, ".cursor", "mcp.json"), "utf8")).mcpServers)[0];
    assert.equal(again.env.SOCIAL_MCP_HOME, flagged);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
