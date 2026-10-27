import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
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
