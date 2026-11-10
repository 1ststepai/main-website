import test from "node:test";
import assert from "node:assert/strict";
import intake from "../api/skillsprout-intake.js";
import admin from "../api/admin-skillsprout.js";
import { validateSubmission, saveSkillSproutContact, listSkillSproutContacts, SKILLSPROUT_KEY, enforceIntakeLimit } from "../lib/admin/skillsproutStore.js";
import { decryptProtectedJson } from "../lib/security/dataProtection.js";
const valid = { email: " Parent@example.com ", consent: true, tag: "SkillSprout", source: "starter-pack" };
function response() { return { headers: {}, setHeader(k,v) { this.headers[k] = v; }, end(body) { this.body = body ? JSON.parse(body) : null; } }; }
function request(body = valid, headers = {}) { return { method: "POST", headers: { origin: "https://skillsprout.1ststep.ai", "content-type": "application/json", ...headers }, body }; }
test("validation requires explicit consent and SkillSprout provenance", () => {
  assert.equal(validateSubmission(valid).email, "parent@example.com");
  for (const patch of [{ consent: false }, { consent: "true" }, { consent: undefined }, { tag: "1stStep" }, { source: "newsletter" }, { email: "bad" }, { email: "a\nb@example.com" }]) assert.throws(() => validateSubmission({ ...valid, ...patch }));
  assert.equal(validateSubmission({ ...valid, source: "feature-request" }).source, "feature-request");
});
test("encrypted atomic isolated storage, listing and distributed rate limits", async () => {
  const oldFetch = global.fetch;
  const original = { ...process.env };
  Object.assign(process.env, { KV_REST_API_URL: "https://kv.example", KV_REST_API_TOKEN: "test", FIRSTSTEP_DATA_ENCRYPTION_KEY: "11".repeat(32) });
  const rows = []; const calls = []; let count = 0;
  global.fetch = async (_url, options) => {
    const parts = JSON.parse(options.body); calls.push(parts);
    let result;
    if (parts[0] === "LPUSH") { rows.unshift(parts[2]); result = rows.length; }
    if (parts[0] === "LRANGE") result = rows.slice(Number(parts[2]), Number(parts[3]) + 1);
    if (parts[0] === "EVAL") result = ++count;
    return { ok: true, json: async () => ({ result }) };
  };
  try {
    await Promise.all([saveSkillSproutContact(valid), saveSkillSproutContact({ ...valid, source: "feature-request" })]);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(r => !r.includes("parent@example.com")));
    const contact = decryptProtectedJson(rows[0], "skillsprout-contacts");
    assert.equal(contact.tag, "SkillSprout"); assert.equal(contact.consent, true); assert.ok(Date.parse(contact.timestamp));
    assert.throws(() => decryptProtectedJson(rows[0], "admin-workspace"));
    assert.equal((await listSkillSproutContacts()).length, 2);
    assert.ok(calls.every(c => c[1] === SKILLSPROUT_KEY));
    for (let n = 0; n < 12; n++) await enforceIntakeLimit("192.0.2.1");
    await assert.rejects(enforceIntakeLimit("192.0.2.1"), { statusCode: 429 });
    assert.ok(!JSON.stringify(calls).includes("192.0.2.1"));
    count = 0;
    const res = response(); await intake(request(), res); assert.equal(res.statusCode, 201); assert.deepEqual(res.body, { ok: true });
    global.fetch = async () => ({ ok: false, status: 500 });
    const failed = response(); await intake(request(), failed); assert.equal(failed.statusCode, 503); assert.ok(!JSON.stringify(failed).includes(valid.email));
  } finally { global.fetch = oldFetch; process.env = original; }
});
test("intake rejects invalid requests before storage and supports preflight", async () => {
  for (const [req, status] of [[request(valid, { origin: "https://evil.example" }),403], [request(valid, { origin: undefined }),403], [request({ ...valid, consent: false }),400], [request("{"),400], [request(valid, { "content-type": "text/plain" }),415], [request({ ...valid, padding: "x".repeat(2048) }),413], [{ ...request(), method: "GET" },405], [{ ...request(), method: "OPTIONS" },204]]) {
    const res = response(); await intake(req,res); assert.equal(res.statusCode,status);
    if (status === 204) assert.equal(res.headers["Access-Control-Allow-Origin"], "https://skillsprout.1ststep.ai");
  }
});
test("admin listing denies anonymous requests", async () => {
  const res = response(); await admin({ method: "GET", headers: {}, url: "/api/admin-skillsprout" },res); assert.equal(res.statusCode,401);
});
