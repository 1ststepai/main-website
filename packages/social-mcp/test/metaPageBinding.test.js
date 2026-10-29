import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createStore } from "../src/store.js";
import { createOAuthRuntime } from "../src/oauth/server.js";

const PAGES = [
  { id: "111", name: "Acme Page", access_token: "fake-page-111" },
  { id: "222", name: "Beta Page", access_token: "fake-page-222" },
];

function metaFetch() {
  return async (resource) => {
    const href = String(resource);
    if (href.includes("/oauth/access_token")) {
      return { ok: true, text: async () => JSON.stringify({ access_token: "fake-user-token", expires_in: 5184000 }) };
    }
    if (href.includes("/me/accounts")) return { ok: true, text: async () => JSON.stringify({ data: PAGES }) };
    return { ok: false, text: async () => "{}" };
  };
}

async function connect(oauth, port, profile) {
  const started = await oauth.connectAccounts(profile, { platforms: ["meta"], open: false, force: true });
  const state = new URL(started.authorize_url).searchParams.get("state");
  return fetch(`http://127.0.0.1:${port}/oauth/callback?code=c&state=${encodeURIComponent(state)}`);
}

test("Meta connect keeps only the Page token, asks for a choice, and refuses a Page bound to another brand", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-metabind-"));
  const store = createStore({ home });
  store.upsertProfile({ id: "acme", name: "Acme", presets: { meta_page: "111" } });
  store.upsertProfile({ id: "beta", name: "Beta" });
  store.upsertProfile({ id: "copycat", name: "Copycat", presets: { meta_page: "Acme Page" } });
  const port = 48831;
  const oauth = createOAuthRuntime({
    store,
    fetchImpl: metaFetch(),
    env: { META_APP_ID: "123456789012345", META_APP_SECRET: "meta-app-secret-value", SOCIAL_MCP_OAUTH_PORT: String(port) },
    port,
  });
  try {
    const ok = await connect(oauth, port, "acme");
    assert.equal(ok.status, 200);
    const secrets = store.readSecrets("acme", "facebook");
    assert.equal(secrets.page_access_token, "fake-page-111");
    assert.equal("user_access_token" in secrets, false);

    const choose = await connect(oauth, port, "beta");
    assert.equal(choose.status, 400);
    const chooseHtml = await choose.text();
    assert.match(chooseHtml, /Acme Page \(111\)/);
    assert.doesNotMatch(chooseHtml, /fake-page|fake-user/);
    assert.equal(store.getConnection("beta", "facebook"), null);

    const taken = await connect(oauth, port, "copycat");
    assert.equal(taken.status, 409);
    assert.match(await taken.text(), /already linked to profile acme/);
    assert.equal(store.getConnection("copycat", "facebook"), null);
  } finally {
    await oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});
