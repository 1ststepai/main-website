import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { paths } from "../src/home.js";
import { xAvailable, withOwnX } from "../src/xAccess.js";

function makeHome(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function saveOwnX(home) {
  writeFileSync(paths(home).oauthEnv, "X_CLIENT_ID=own-client-id\nX_CLIENT_SECRET=own-client-value\n");
}

test("X is hidden and refused on a desk with no X app of its own", async () => {
  const home = makeHome("pp-x-off-");
  const engine = createEngine({ home, env: { SOCIAL_MCP_OAUTH_PORT: "48761" } });
  try {
    await engine.upsertProfile({ id: "acme", name: "Acme" });
    assert.equal(xAvailable(engine.store.homePaths), false);
    await assert.rejects(engine.connectAccounts("acme", { platforms: ["x"], open: false }), (e) => e.code === "x_unavailable" && /isn't available on this desk/.test(e.message));
    await assert.rejects(engine.createDraft({ profile_id: "acme", platform: "x", text: "hi", caption: "hi" }), (e) => e.code === "x_unavailable");
    await assert.rejects(Promise.resolve().then(() => engine.manage.queue({ profile_id: "acme", type: "x.create_post", params: {} })), (e) => e.code === "x_unavailable");
    const view = engine.manage.view("acme");
    assert.equal(view.x_available, false);
    assert.ok(!view.access.some((row) => row.platform === "x"));
    assert.ok(!view.catalog.some((row) => row.platform === "x"));
  } finally {
    await engine.oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test("no shared fallback: X keys in the process env or pilot env do not enable X", async () => {
  const home = makeHome("pp-x-env-");
  const env = { SOCIAL_MCP_OAUTH_PORT: "48762", X_CLIENT_ID: "shared-id", X_CLIENT_SECRET: "shared-value", POSTPATH_ENABLE_X: "1", SOCIAL_MCP_PILOT_MODE: "1" };
  const engine = createEngine({ home, env });
  try {
    await engine.upsertProfile({ id: "acme", name: "Acme" });
    assert.equal(xAvailable(engine.store.homePaths), false);
    await assert.rejects(engine.connectAccounts("acme", { platforms: ["x"], open: false }), (e) => e.code === "x_unavailable");
    const config = withOwnX({ x: { clientId: "shared-id", clientSecret: "shared-value" } }, engine.store.homePaths);
    assert.equal(config.x.clientId, "");
    assert.equal(config.x.clientSecret, "");
  } finally {
    await engine.oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test("X becomes available after the desk saves its own X app, pilot included", async () => {
  for (const pilot of ["0", "1"]) {
    const home = makeHome("pp-x-on-");
    saveOwnX(home);
    const engine = createEngine({ home, env: { SOCIAL_MCP_OAUTH_PORT: pilot === "1" ? "48764" : "48763", SOCIAL_MCP_PILOT_MODE: pilot } });
    try {
      await engine.upsertProfile({ id: "acme", name: "Acme" });
      assert.equal(xAvailable(engine.store.homePaths), true);
      assert.equal(engine.manage.view("acme").x_available, true);
      assert.ok(engine.manage.view("acme").access.some((row) => row.platform === "x"));
      const result = await engine.connectAccounts("acme", { platforms: ["x"], open: false });
      assert.equal(result.started, "x");
      assert.equal(new URL(result.authorize_url).searchParams.get("client_id"), "own-client-id");
    } finally {
      await engine.oauth.stop();
      rmSync(home, { recursive: true, force: true });
    }
  }
});

test("pilot install entry carries no X credentials or X switch", async () => {
  const { buildSocialMcpServerEntry } = await import("../src/cursorConfig.js");
  const entry = buildSocialMcpServerEntry({ pilot: true, home: "/tmp/pp-pilot-home" });
  const text = JSON.stringify(entry);
  assert.equal(/X_CLIENT_ID|X_CLIENT_SECRET|ENABLE_X/.test(text), false);
});
