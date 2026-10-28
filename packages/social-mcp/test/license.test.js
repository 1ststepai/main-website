import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { assertActionAllowed, assertProfileAllowed, getEntitlement, getLicenseState } from "../src/license.js";

const LOCKED = {
  POSTPATH_LICENSE_ENFORCE: "true",
  POSTPATH_TIER: "pro",
  POSTPATH_LICENSE_KEY: "stub-key",
  POSTPATH_LICENSE_REVOKED: "true",
  POSTPATH_LICENSE_EXPIRES_AT: "2000-01-01T00:00:00.000Z",
};

test("PostPath stays free with no plan limits", () => {
  for (const env of [{}, LOCKED, { POSTPATH_TIER: "disabled" }, { POSTPATH_LICENSE_ENFORCE: "TRUE" }]) {
    const state = getLicenseState(env);
    const entitlement = getEntitlement(env);
    assert.equal(state.enforce, false);
    assert.equal(state.tier, "free");
    assert.equal(state.profileLimit, null);
    assert.equal(entitlement.offer, "free");
    assert.equal(entitlement.paid, false);
    assert.equal(entitlement.provider, null);
    assert.equal(entitlement.enforce, false);
    assert.equal(entitlement.profileLimit, null);
    assert.equal(entitlement.keyPresent, false);
    assert.equal(assertActionAllowed("publish", entitlement).ok, true);
    assert.equal(assertActionAllowed("create_profile", entitlement).ok, true);
    assert.equal(assertProfileAllowed(50, { enforce: true, profileLimit: 1, tier: "pro" }).ok, true);
  }
});

test("a bad profile count is rejected and unknown actions stay unknown", () => {
  assert.throws(() => assertProfileAllowed(-1), (error) => error.code === "license_invalid_count");
  assert.throws(() => assertActionAllowed("delete_account"), (error) => error.code === "license_unknown_action");
});

test("enforced tier env still allows a second profile and a publish", async () => {
  const home = mkdtempSync(join(tmpdir(), "postpath-free-"));
  const engine = createEngine({ home, env: { ...LOCKED, SOCIAL_MCP_OAUTH_PORT: "0", SOCIAL_MCP_PUBLISH_MODE: "mock" } });
  try {
    await engine.upsertProfile({ id: "one", name: "One" });
    await engine.upsertProfile({ id: "two", name: "Two" });
    const created = await engine.createDraft({
      profile_id: "one",
      platform: "bluesky",
      title: "Free",
      caption: "No plan",
    });
    engine.store.saveConnection(
      { profile_id: "one", platform: "bluesky", account_label: "one.bsky.social" },
      { access_token: "token", refresh_token: "rt" },
    );
    const published = await engine.publishPost({ post_id: created.post.id, force: true });
    assert.equal(published.post.status === "published" || published.post.status === "handed_off", true);
  } finally {
    await engine.oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
});

test("the desk does not ask anyone to upgrade", () => {
  const html = readFileSync(new URL("../src/desk/public/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/desk/public/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(`${html}\n${app}`, /upgrade|paywall|subscribe|billing|pricing plan|pro plan/i);
});

test("license evaluation does not call the network", () => {
  const source = readFileSync(new URL("../src/license.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch\(|https?:\/\//);
});
