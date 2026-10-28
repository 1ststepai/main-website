import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { decryptJson, encryptJson, loadOrCreateKey, signState, verifyState } from "../src/crypto.js";
import { paths } from "../src/home.js";
import { createStore } from "../src/store.js";

test("encrypt and decrypt round trip", () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-"));
  try {
    const key = loadOrCreateKey(paths(home));
    const envelope = encryptJson({ refresh_token: "rt_test" }, "conn:youtube", key);
    assert.match(envelope, /^smcp_enc_v1\./);
    const decoded = decryptJson(envelope, "conn:youtube", key);
    assert.equal(decoded.refresh_token, "rt_test");
    assert.throws(() => decryptJson(envelope, "conn:tiktok", key));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("signed oauth state verifies", () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-"));
  try {
    const key = loadOrCreateKey(paths(home));
    const token = signState({ profile_id: "acme", provider: "youtube", ts: 1 }, key);
    const payload = verifyState(token, key);
    assert.equal(payload.profile_id, "acme");
    assert.throws(() => verifyState(`${token}x`, key));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("store keeps secrets out of public connection views", () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-"));
  try {
    const store = createStore({ home });
    store.upsertProfile({ id: "acme", name: "Acme" });
    const publicConn = store.saveConnection(
      {
        profile_id: "acme",
        platform: "youtube",
        account_label: "@acme",
        channel_id: "UCtest",
      },
      { refresh_token: "secret-refresh", access_token: "secret-access" },
    );
    assert.equal(publicConn.has_secrets, true);
    assert.equal(publicConn.secrets_enc, undefined);
    assert.equal(publicConn.refresh_token, undefined);
    const secrets = store.readSecrets("acme", "youtube");
    assert.equal(secrets.refresh_token, "secret-refresh");
    const listed = store.listConnections("acme");
    assert.equal(listed.length, 1);
    assert.equal(listed[0].channel_id, "UCtest");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a second store on the same home sees the first store's drafts", () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-share-"));
  try {
    const writer = createStore({ home });
    const reader = createStore({ home });
    assert.equal(reader.listBundles().length, 0);
    writer.upsertProfile({ id: "acme", name: "Acme" });
    assert.equal(reader.getProfile("acme").name, "Acme");
    const stamp = "2026-06-01T12:00:00.000Z";
    writer.savePost(
      {
        id: "post_shared0001",
        profile_id: "acme",
        platform: "youtube",
        status: "draft",
        title: "Shared",
        caption: "Hello",
        created_at: stamp,
        updated_at: stamp,
      },
      { create: true },
    );
    writer.saveBundle({
      id: "bnd_shared0001",
      profile_id: "acme",
      status: "draft",
      title: "Shared",
      platforms: ["youtube"],
      child_ids: { youtube: "post_shared0001" },
      source: "mcp",
      created_at: stamp,
      updated_at: stamp,
    });
    assert.equal(reader.listPosts().length, 1);
    assert.equal(reader.getPost("post_shared0001").platform, "youtube");
    assert.equal(reader.listBundles()[0].id, "bnd_shared0001");
    assert.equal(reader.getBundle("bnd_shared0001").source, "mcp");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("forgetVault deletes the saved accounts and refuses later writes", () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-forget-"));
  const store = createStore({ home });
  store.upsertProfile({ id: "acme", name: "Acme" });
  assert.equal(existsSync(store.homePaths.keyFile), true);
  const removed = store.forgetVault();
  assert.equal(removed.removed, true);
  assert.equal(existsSync(home), false);
  assert.throws(() => store.savePost({ id: "post12345678", status: "draft" }), /Saved accounts were removed/);
});
