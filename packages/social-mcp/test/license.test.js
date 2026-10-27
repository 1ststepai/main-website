import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { assertActionAllowed, assertProfileAllowed, getEntitlement, getLicenseState } from "../src/license.js";

async function withTempEngine(env, fn) {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-lic-"));
  const engine = createEngine({ home, env, now: () => Date.UTC(2026, 9, 27, 12) });
  try {
    return await fn(engine);
  } finally {
    await engine.oauth.stop();
    rmSync(home, { recursive: true, force: true });
  }
}

test("default state is free, unenforced, unlimited profiles", () => {
  const state = getLicenseState({});
  assert.equal(state.tier, "free");
  assert.equal(state.enforce, false);
  assert.equal(state.profileLimit, null);
  assert.deepEqual(state.warnings, []);
});

test("POSTPATH_LICENSE_ENFORCE must be exactly true to enable limits", () => {
  assert.equal(getLicenseState({ POSTPATH_LICENSE_ENFORCE: "1" }).enforce, false);
  assert.equal(getLicenseState({ POSTPATH_LICENSE_ENFORCE: "yes" }).enforce, false);
  assert.equal(getLicenseState({ POSTPATH_LICENSE_ENFORCE: "TRUE" }).enforce, true);
  assert.equal(getLicenseState({ POSTPATH_LICENSE_ENFORCE: "true" }).enforce, true);
});

test("enforced solo/free maps to 1 profile (free tier)", () => {
  const solo = getLicenseState({ POSTPATH_LICENSE_ENFORCE: "true", POSTPATH_TIER: "solo" });
  assert.equal(solo.tier, "free");
  assert.equal(solo.enforce, true);
  assert.equal(solo.profileLimit, 1);

  const free = getLicenseState({ POSTPATH_LICENSE_ENFORCE: "true", POSTPATH_TIER: "free" });
  assert.equal(free.tier, "free");
  assert.equal(free.profileLimit, 1);
});

test("enforced pro and agency soft limits", () => {
  const pro = getLicenseState({ POSTPATH_LICENSE_ENFORCE: "true", POSTPATH_TIER: "pro" });
  assert.equal(pro.tier, "pro");
  assert.equal(pro.profileLimit, 5);

  const agency = getLicenseState({ POSTPATH_LICENSE_ENFORCE: "true", POSTPATH_TIER: "agency" });
  assert.equal(agency.tier, "agency");
  assert.equal(agency.profileLimit, Infinity);
});

test("enforced disabled tier blocks all profiles", () => {
  const state = getLicenseState({ POSTPATH_LICENSE_ENFORCE: "true", POSTPATH_TIER: "disabled" });
  assert.equal(state.tier, "disabled");
  assert.equal(state.profileLimit, 0);
});

test("unknown tier warns and defaults to solo limit when enforce is on", () => {
  const state = getLicenseState({ POSTPATH_LICENSE_ENFORCE: "true", POSTPATH_TIER: "enterprise" });
  assert.equal(state.tier, "free");
  assert.equal(state.profileLimit, 1);
  assert.equal(state.warnings.length, 1);
  assert.match(state.warnings[0], /Unknown POSTPATH_TIER/);
});

test("tier env is ignored when enforce is off", () => {
  const state = getLicenseState({ POSTPATH_LICENSE_ENFORCE: "false", POSTPATH_TIER: "solo" });
  assert.equal(state.enforce, false);
  assert.equal(state.profileLimit, null);
  assert.equal(state.tier, "free");
});

test("assertProfileAllowed ok under limit", () => {
  const state = { tier: "pro", enforce: true, profileLimit: 5, warnings: [] };
  const result = assertProfileAllowed(2, state);
  assert.equal(result.status, "ok");
  assert.equal(result.ok, true);
  assert.equal(result.message, null);
});

test("assertProfileAllowed warning at exact limit", () => {
  const state = { tier: "free", enforce: true, profileLimit: 1, warnings: [] };
  const result = assertProfileAllowed(1, state);
  assert.equal(result.status, "warning");
  assert.equal(result.ok, true);
  assert.match(result.message, /At profile limit/);
});

test("assertProfileAllowed throws when enforce and over hard limit", () => {
  const state = { tier: "pro", enforce: true, profileLimit: 5, warnings: [] };
  assert.throws(
    () => assertProfileAllowed(6, state),
    (error) => error.code === "license_profile_limit" && error.statusCode === 403,
  );
});

test("assertProfileAllowed returns error without throw when not enforcing", () => {
  const state = { tier: "free", enforce: false, profileLimit: 1, warnings: [] };
  const result = assertProfileAllowed(3, state);
  assert.equal(result.status, "error");
  assert.equal(result.ok, false);
  assert.match(result.message, /Profile limit exceeded/);
});

test("assertProfileAllowed unlimited when profileLimit is null", () => {
  const result = assertProfileAllowed(99, { tier: "free", enforce: false, profileLimit: null });
  assert.equal(result.status, "ok");
  assert.equal(result.ok, true);
  assert.equal(result.profileLimit, null);
});

test("assertProfileAllowed unlimited when profileLimit is Infinity", () => {
  const result = assertProfileAllowed(50, { tier: "agency", enforce: true, profileLimit: Infinity });
  assert.equal(result.status, "ok");
  assert.equal(result.ok, true);
  assert.equal(result.profileLimit, Infinity);
});

test("assertProfileAllowed rejects invalid counts", () => {
  const state = getLicenseState({});
  assert.throws(
    () => assertProfileAllowed(-1, state),
    (error) => error.code === "license_invalid_count",
  );
  assert.throws(
    () => assertProfileAllowed(Number.NaN, state),
    (error) => error.code === "license_invalid_count",
  );
});

test("upsertProfile license gate stays off by default and enforces via env", async () => {
  await withTempEngine({}, async (engine) => {
    await engine.upsertProfile({ id: "one", name: "One" });
    await engine.upsertProfile({ id: "two", name: "Two" });
  });

  await withTempEngine({ POSTPATH_LICENSE_ENFORCE: "true", POSTPATH_TIER: "solo" }, async (engine) => {
    await engine.upsertProfile({ id: "solo", name: "Solo" });
    await engine.upsertProfile({ id: "solo", name: "Solo Renamed" });
    await assert.rejects(
      () => engine.upsertProfile({ id: "second", name: "Second" }),
      /license_profile_limit|Profile limit/i,
    );
  });
});

test("getLicenseState ignores key, revocation, and expiry", () => {
  const open = getLicenseState({
    POSTPATH_LICENSE_KEY: "abc",
    POSTPATH_LICENSE_REVOKED: "true",
    POSTPATH_LICENSE_EXPIRES_AT: "2000-01-01T00:00:00.000Z",
    POSTPATH_TIER: "pro",
  });
  assert.deepEqual(open, {
    tier: "free",
    enforce: false,
    profileLimit: null,
    warnings: [],
  });

  const enforced = getLicenseState({
    POSTPATH_LICENSE_ENFORCE: "true",
    POSTPATH_TIER: "pro",
    POSTPATH_LICENSE_REVOKED: "true",
    POSTPATH_LICENSE_EXPIRES_AT: "not-a-date",
  });
  assert.deepEqual(enforced, {
    tier: "pro",
    enforce: true,
    profileLimit: 5,
    warnings: [],
  });
});

test("default entitlement is early access, unconfigured, and unlimited", () => {
  const env = Object.create(null);
  const entitlement = getEntitlement(env);
  assert.equal(entitlement.offer, "early_access");
  assert.equal(entitlement.paid, false);
  assert.equal(entitlement.provider, null);
  assert.equal(entitlement.enforce, false);
  assert.equal(entitlement.tier, "free");
  assert.equal(entitlement.profileLimit, null);
  assert.equal(entitlement.status, "unconfigured");
  assert.deepEqual(entitlement.warnings, []);
  assert.equal(entitlement.keyPresent, false);
  assert.equal(assertActionAllowed("create_profile", entitlement).ok, true);
  assert.equal(assertActionAllowed("publish", entitlement).ok, true);
});

test("a license key does not activate a paid plan or change the offer", () => {
  const cases = [
    { POSTPATH_LICENSE_KEY: "stub-key" },
    { POSTPATH_LICENSE_KEY: "stub-key", POSTPATH_LICENSE_ENFORCE: "true", POSTPATH_TIER: "agency" },
    { POSTPATH_LICENSE_KEY: "stub-key", POSTPATH_LICENSE_REVOKED: "true" },
    { POSTPATH_LICENSE_KEY: "stub-key", POSTPATH_LICENSE_EXPIRES_AT: "2000-01-01T00:00:00.000Z" },
  ];
  for (const env of cases) {
    const entitlement = getEntitlement(env);
    assert.equal(entitlement.offer, "early_access");
    assert.equal(entitlement.paid, false);
    assert.equal(entitlement.provider, null);
    assert.equal(entitlement.keyPresent, true);
  }
  assert.equal(getEntitlement({ POSTPATH_LICENSE_KEY: "   " }).keyPresent, false);
});

test("enforced entitlement is an unpaid active stub with existing profile caps", () => {
  const expected = [
    ["solo", "free", 1],
    ["free", "free", 1],
    ["pro", "pro", 5],
    ["agency", "agency", Infinity],
    ["disabled", "disabled", 0],
  ];
  for (const [tierName, tier, profileLimit] of expected) {
    const entitlement = getEntitlement({
      POSTPATH_LICENSE_ENFORCE: "TRUE",
      POSTPATH_TIER: tierName,
    });
    assert.equal(entitlement.status, "active_stub");
    assert.equal(entitlement.enforce, true);
    assert.equal(entitlement.paid, false);
    assert.equal(entitlement.provider, null);
    assert.equal(entitlement.offer, "early_access");
    assert.equal(entitlement.tier, tier);
    assert.equal(entitlement.profileLimit, profileLimit);
    assert.equal(assertActionAllowed("create_profile", entitlement).ok, true);
    assert.equal(assertActionAllowed("publish", entitlement).ok, true);
  }

  const unknown = getEntitlement({ POSTPATH_LICENSE_ENFORCE: "true", POSTPATH_TIER: "enterprise" });
  assert.equal(unknown.status, "active_stub");
  assert.equal(unknown.profileLimit, 1);
  assert.match(unknown.warnings[0], /Unknown POSTPATH_TIER/);
});

test("revoked early access stays usable until enforcement is on", () => {
  const open = getEntitlement({ POSTPATH_LICENSE_REVOKED: "true", POSTPATH_TIER: "pro" });
  assert.equal(open.status, "revoked");
  assert.equal(open.enforce, false);
  assert.equal(open.profileLimit, null);
  assert.equal(open.offer, "early_access");
  assert.equal(open.paid, false);
  assert.deepEqual(open.warnings, ["POSTPATH_LICENSE_REVOKED=true."]);
  assert.equal(assertActionAllowed("create_profile", open).ok, true);
  assert.equal(assertActionAllowed("publish", open).ok, true);

  assert.equal(getEntitlement({ POSTPATH_LICENSE_REVOKED: "yes" }).status, "unconfigured");
  assert.equal(getEntitlement({ POSTPATH_LICENSE_REVOKED: "1" }).status, "unconfigured");

  const closed = getEntitlement({
    POSTPATH_LICENSE_ENFORCE: "true",
    POSTPATH_LICENSE_REVOKED: "TRUE",
    POSTPATH_TIER: "pro",
  });
  assert.equal(closed.status, "revoked");
  assert.equal(closed.paid, false);
  assert.equal(closed.profileLimit, 5);
  assert.deepEqual(closed.warnings, ["POSTPATH_LICENSE_REVOKED=true."]);
  for (const action of ["create_profile", "publish"]) {
    assert.throws(
      () => assertActionAllowed(action, closed),
      (error) => error.code === "license_revoked" && error.statusCode === 403 && /revoked/.test(error.message),
    );
  }
});

test("past expiry blocks only when enforcement is on", () => {
  const past = "2000-01-01T00:00:00.000Z";
  const open = getEntitlement({ POSTPATH_LICENSE_EXPIRES_AT: past });
  assert.equal(open.status, "expired");
  assert.equal(open.enforce, false);
  assert.equal(open.profileLimit, null);
  assert.deepEqual(open.warnings, ["POSTPATH_LICENSE_EXPIRES_AT is in the past."]);
  assert.equal(assertActionAllowed("publish", open).ok, true);

  const closed = getEntitlement({
    POSTPATH_LICENSE_ENFORCE: "true",
    POSTPATH_TIER: "solo",
    POSTPATH_LICENSE_EXPIRES_AT: " 2000-01-01T00:00:00-05:00 ",
  });
  assert.equal(closed.status, "expired");
  assert.equal(closed.profileLimit, 1);
  assert.equal(closed.paid, false);
  assert.throws(
    () => assertActionAllowed("create_profile", closed),
    (error) => error.code === "license_expired" && error.statusCode === 403,
  );
});

test("a future ISO instant is not expired", () => {
  for (const expiresAt of ["2099-06-15T15:04:05Z", "2099-06-15T15:04:05.123Z", "2099-06-15T15:04:05+00:00"]) {
    const open = getEntitlement({ POSTPATH_LICENSE_EXPIRES_AT: expiresAt });
    assert.equal(open.status, "unconfigured");
    assert.deepEqual(open.warnings, []);
    const closed = getEntitlement({ POSTPATH_LICENSE_ENFORCE: "true", POSTPATH_LICENSE_EXPIRES_AT: expiresAt });
    assert.equal(closed.status, "active_stub");
    assert.equal(assertActionAllowed("publish", closed).ok, true);
  }
});

test("unparseable expiry warns and fails closed only when enforcement is on", () => {
  for (const expiresAt of ["next-week", "2020-01-01", "2020-01-01T00:00:00", "2020-02-31T00:00:00.000Z"]) {
    const open = getEntitlement({ POSTPATH_LICENSE_EXPIRES_AT: expiresAt });
    assert.equal(open.status, "invalid");
    assert.equal(open.enforce, false);
    assert.deepEqual(open.warnings, ["POSTPATH_LICENSE_EXPIRES_AT is not a valid ISO instant."]);
    assert.equal(assertActionAllowed("create_profile", open).ok, true);
  }

  assert.equal(getEntitlement({ POSTPATH_LICENSE_EXPIRES_AT: "   " }).status, "unconfigured");

  const closed = getEntitlement({
    POSTPATH_LICENSE_ENFORCE: "true",
    POSTPATH_TIER: "agency",
    POSTPATH_LICENSE_EXPIRES_AT: "tomorrow",
  });
  assert.equal(closed.status, "invalid");
  assert.equal(closed.profileLimit, Infinity);
  assert.equal(closed.paid, false);
  assert.throws(
    () => assertActionAllowed("publish", closed),
    (error) => error.code === "license_invalid_expiry" && error.statusCode === 403,
  );
});

test("revocation wins over expiry", () => {
  const entitlement = getEntitlement({
    POSTPATH_LICENSE_ENFORCE: "true",
    POSTPATH_LICENSE_REVOKED: "true",
    POSTPATH_LICENSE_EXPIRES_AT: "2000-01-01T00:00:00.000Z",
    POSTPATH_TIER: "nope",
  });
  assert.equal(entitlement.status, "revoked");
  assert.deepEqual(entitlement.warnings, [
    'Unknown POSTPATH_TIER "nope"; defaulting to solo (1 profile).',
    "POSTPATH_LICENSE_EXPIRES_AT is in the past.",
    "POSTPATH_LICENSE_REVOKED=true.",
  ]);
  assert.throws(
    () => assertActionAllowed("publish", entitlement),
    (error) => error.code === "license_revoked",
  );

  const state = getLicenseState({
    POSTPATH_LICENSE_ENFORCE: "true",
    POSTPATH_TIER: "nope",
    POSTPATH_LICENSE_REVOKED: "true",
  });
  assert.equal(state.warnings.length, 1);
});

test("assertActionAllowed allows known actions when enforce is false and rejects unknown actions", () => {
  const entitlement = { enforce: false, status: "revoked" };
  assert.deepEqual(assertActionAllowed("create_profile", entitlement), {
    ok: true,
    action: "create_profile",
    status: "revoked",
  });
  assert.throws(
    () => assertActionAllowed("delete_account", entitlement),
    (error) => error.code === "license_unknown_action" && error.statusCode === 400,
  );
});

test("license evaluation is offline and uses only the env object", () => {
  const source = readFileSync(new URL("../src/license.js", import.meta.url), "utf8");
  assert.equal(/\bfetch\b/.test(source), false);
  assert.equal(/\bhttps?\b/.test(source), false);
  assert.equal(/\bXMLHttpRequest\b|\baxios\b|\bundici\b|\bWebSocket\b/.test(source), false);

  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (...args) => {
    calls.push(args);
    throw new Error("network");
  };
  try {
    const env = {
      POSTPATH_LICENSE_KEY: "local-only",
      POSTPATH_LICENSE_EXPIRES_AT: "2099-01-01T00:00:00.000Z",
    };
    const first = getEntitlement(env);
    const second = getEntitlement(env);
    assert.deepEqual(first, second);
    assert.equal(first.status, "unconfigured");
    assert.equal(first.keyPresent, true);
    assert.equal(first.paid, false);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = previous;
  }
});
