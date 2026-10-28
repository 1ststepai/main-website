import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createStore } from "../src/store.js";
import { createOAuthRuntime } from "../src/oauth/server.js";
import { authorizationUrl, exchangeCode, oauthConfig } from "../src/oauth/providers.js";

const redirectUri = "http://127.0.0.1:47831/oauth/callback";

function googleConfig() {
  return oauthConfig(
    {
      GOOGLE_OAUTH_CLIENT_ID: "gid.apps.googleusercontent.com",
      GOOGLE_OAUTH_CLIENT_SECRET: "not-a-confidential-desktop-secret",
    },
    redirectUri,
  );
}

test("youtube authorization and token exchange require PKCE", async () => {
  const config = googleConfig();
  const pkce = { verifier: "verifier-value-with-enough-entropy-1234567890", challenge: "challenge-value" };
  assert.throws(() => authorizationUrl("youtube", { state: "st", config, pkce: null }), /PKCE/);
  const url = new URL(authorizationUrl("youtube", { state: "st", config, pkce }));
  assert.equal(url.searchParams.get("code_challenge"), "challenge-value");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("client_id"), "gid.apps.googleusercontent.com");
  let body = "";
  const fetchImpl = async (resource, options = {}) => {
    const href = String(resource);
    if (href.includes("oauth2.googleapis.com/token")) {
      body = String(options.body);
      return {
        ok: true,
        text: async () => JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "youtube" }),
      };
    }
    return {
      ok: true,
      text: async () => JSON.stringify({ items: [{ id: "UC1", snippet: { title: "Swing Trade Pros" } }] }),
    };
  };
  const exchanged = await exchangeCode("youtube", {
    code: "auth-code",
    config,
    fetchImpl,
    codeVerifier: pkce.verifier,
  });
  assert.match(body, /code_verifier=verifier-value-with-enough-entropy-1234567890/);
  assert.match(body, /client_secret=not-a-confidential-desktop-secret/);
  assert.equal(exchanged.platforms.youtube.record.account_label, "Swing Trade Pros");
  await assert.rejects(
    exchangeCode("youtube", { code: "auth-code", config, fetchImpl, codeVerifier: "" }),
    /PKCE/,
  );
});

test("youtube connect URL from the local runtime carries a PKCE challenge", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-pkce-"));
  const store = createStore({ home });
  store.upsertProfile({ id: "acme", name: "Acme Co" });
  const oauth = createOAuthRuntime({
    store,
    env: {
      GOOGLE_OAUTH_CLIENT_ID: "gid.apps.googleusercontent.com",
      GOOGLE_OAUTH_CLIENT_SECRET: "desktop-secret",
      SOCIAL_MCP_OAUTH_PORT: "48731",
    },
    port: 48731,
  });
  try {
    const pending = await oauth.connectAccounts("acme", { platforms: ["youtube"], open: false });
    const url = new URL(pending.authorize_url);
    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.ok(url.searchParams.get("code_challenge"));
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:48731");
    assert.equal(pending.redirect_uri, "http://127.0.0.1:48731/oauth/callback");
    assert.equal(pending.google_redirect_uri, "http://127.0.0.1:48731");
  } finally {
    await oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});
