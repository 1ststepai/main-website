import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createStore } from "../src/store.js";
import { createOAuthRuntime, escapeHtml } from "../src/oauth/server.js";

test("PKCE verifier stays server-side, state is single-use, callback pages escape HTML", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-state-"));
  const store = createStore({ home });
  store.upsertProfile({ id: "acme", name: "Acme Co" });
  let tokenBody = "";
  const fetchImpl = async (resource, options = {}) => {
    if (String(resource).includes("oauth2.googleapis.com/token")) {
      tokenBody = String(options.body);
      return { ok: true, text: async () => JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "youtube" }) };
    }
    return { ok: true, text: async () => JSON.stringify({ items: [{ id: "UC1", snippet: { title: "Acme Channel" } }] }) };
  };
  const oauth = createOAuthRuntime({
    store,
    fetchImpl,
    env: { GOOGLE_OAUTH_CLIENT_ID: "gid.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "desktop-secret", SOCIAL_MCP_OAUTH_PORT: "48821" },
    port: 48821,
  });
  try {
    const started = await oauth.connectAccounts("acme", { platforms: ["youtube"], open: false });
    const state = new URL(started.authorize_url).searchParams.get("state");
    const payload = JSON.parse(Buffer.from(state.split(".")[0], "base64url").toString("utf8"));
    assert.equal("code_verifier" in payload, false);
    assert.doesNotMatch(started.authorize_url, /code_verifier/);

    const cb = `http://127.0.0.1:48821/oauth/callback?code=c1&state=${encodeURIComponent(state)}`;
    const first = await fetch(cb);
    assert.equal(first.status, 200);
    assert.match(tokenBody, /code_verifier=[A-Za-z0-9_-]{43,}/);
    const replay = await fetch(cb);
    assert.equal(replay.status, 400);
    assert.match(await replay.text(), /already used/);

    const xss = await fetch(`http://127.0.0.1:48821/oauth/callback?error=${encodeURIComponent("<script>alert(1)</script>")}`);
    const html = await xss.text();
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
    assert.equal(escapeHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  } finally {
    await oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});
