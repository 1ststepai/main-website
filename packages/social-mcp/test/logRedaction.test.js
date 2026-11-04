import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { installLogRedaction, redactText, redactValue, stripSecretFields } from "../src/redact.js";
import { formatToolError, formatToolResult } from "../src/errors.js";
import { createEngine } from "../src/engine.js";
import { encryptJson } from "../src/crypto.js";

// Fake values shaped like real credentials. None of them is a real secret.
const FAKES = [
  "pp_pat_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
  "pp_at_ZZZZZZZZZZZZZZZZZZZZ",
  "pp_rt_YYYYYYYYYYYYYYYYYYYY",
  "ya29.a0AfH6SMBfakefakefakefake",
  "1//0gFAKEFAKEFAKEFAKEFAKEFAKE",
  "EAAGfakefakefakefakefakefakefakefakefake",
  "sk-ant-fakefakefakefakefake",
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlc2ln",
  "smcp_enc_v1.aaaa.bbbb.cccc",
];

test("redactText removes every token shape and auth header", () => {
  for (const fake of FAKES) {
    const out = redactText(`before ${fake} after`);
    assert.ok(!out.includes(fake), fake);
    assert.match(out, /before .*\[redacted\].* after/);
  }
  assert.equal(redactText("Authorization: Bearer abcdefghijklmnop"), "Authorization: [redacted]");
  assert.equal(redactText("curl -H 'authorization: Basic dXNlcjpwYXNz'"), "curl -H 'authorization: [redacted]'");
  assert.equal(redactText('{"access_token":"plainvalue123","ok":true}'), '{"access_token":"[redacted]","ok":true}');
  assert.equal(redactText("https://graph.facebook.com/me?access_token=abc123&fields=id"), "https://graph.facebook.com/me?access_token=[redacted]&fields=id");
  assert.equal(redactText("client_secret=shhh"), "client_secret=[redacted]");
  assert.equal(redactText("nothing to see"), "nothing to see");
});

test("redactValue masks secret-named keys deeply and keeps the rest", () => {
  const out = redactValue({ headers: { Authorization: "Bearer x", cookie: "a=b" }, nested: [{ refresh_token: "r", label: "ok" }], has_secrets: true });
  assert.deepEqual(out, { headers: { Authorization: "[redacted]", cookie: "[redacted]" }, nested: [{ refresh_token: "[redacted]", label: "ok" }], has_secrets: true });
  const err = redactValue(new Error(`boom ${FAKES[0]}`));
  assert.ok(!err.message.includes(FAKES[0]));
});

test("console output is redacted once installed", () => {
  const seen = [];
  const fake = { log: (...a) => seen.push(a), error: (...a) => seen.push(a) };
  installLogRedaction(fake);
  fake.log(`token ${FAKES[0]}`);
  fake.error({ access_token: "zzz", note: FAKES[3] });
  const flat = JSON.stringify(seen);
  for (const f of [FAKES[0], FAKES[3], "zzz"]) assert.ok(!flat.includes(f));
});

test("MCP tool results and errors never carry credential fields or token text", () => {
  const result = formatToolResult({ connection: { profile_id: "a", secrets_enc: "smcp_enc_v1.x.y.z", access_token: "t", account_label: "A" } });
  assert.deepEqual(result.structuredContent.connection, { profile_id: "a", account_label: "A" });
  const error = formatToolError(new Error(`Upstream said ${FAKES[5]}`));
  assert.ok(!error.content[0].text.includes(FAKES[5]));
  assert.deepEqual(stripSecretFields([{ secrets: { a: 1 }, b: 2 }]), [{ b: 2 }]);
});

test("connection secrets are sealed per brand: a row copied to another brand does not open", () => {
  const home = mkdtempSync(path.join(tmpdir(), "pp-seal-"));
  try {
    const engine = createEngine({ home, env: { SOCIAL_MCP_PUBLISH_MODE: "mock" } });
    const store = engine.store;
    store.upsertProfile({ id: "1ststep-ai", name: "A" });
    store.upsertProfile({ id: "skillsprout", name: "S" });
    store.saveConnection({ profile_id: "1ststep-ai", platform: "youtube", account_label: "A" }, { refresh_token: "fake-a" });
    store.saveConnection({ profile_id: "skillsprout", platform: "youtube", account_label: "S" }, { refresh_token: "fake-s" });
    assert.equal(store.readSecrets("1ststep-ai", "youtube").refresh_token, "fake-a");
    assert.equal(store.readSecrets("skillsprout", "youtube").refresh_token, "fake-s");
    // Public rows carry no sealed material.
    for (const row of store.listConnections()) {
      assert.equal(row.secrets_enc, undefined);
      assert.equal(row.secrets_aad, undefined);
    }
    // Move brand A's sealed token onto brand S's row (simulated tampering / bug).
    const a = store.getConnection("1ststep-ai", "youtube");
    const s = store.getConnection("skillsprout", "youtube");
    s.secrets_enc = a.secrets_enc;
    assert.throws(() => store.readSecrets("skillsprout", "youtube"));
    engine.oauth?.stop?.();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("legacy rows sealed before brand binding still open, and re-seal on update", () => {
  const home = mkdtempSync(path.join(tmpdir(), "pp-legacy-"));
  try {
    const engine = createEngine({ home, env: { SOCIAL_MCP_PUBLISH_MODE: "mock" } });
    const store = engine.store;
    store.upsertProfile({ id: "swing-trade-pros", name: "S" });
    store.saveConnection({ profile_id: "swing-trade-pros", platform: "facebook", account_label: "S" }, { page_access_token: "x" });
    const row = store.getConnection("swing-trade-pros", "facebook");
    const key = Buffer.from(readFileSync(store.homePaths.keyFile, "utf8").trim(), "hex");
    row.secrets_enc = encryptJson({ page_access_token: "legacy" }, "conn:facebook", key);
    delete row.secrets_aad;
    assert.equal(store.readSecrets("swing-trade-pros", "facebook").page_access_token, "legacy");
    store.updateSecrets("swing-trade-pros", "facebook", { page_access_token: "new" });
    assert.equal(store.getConnection("swing-trade-pros", "facebook").secrets_aad, "brand_v2");
    assert.equal(store.readSecrets("swing-trade-pros", "facebook").page_access_token, "new");
    engine.oauth?.stop?.();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
