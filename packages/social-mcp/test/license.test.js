import assert from "node:assert/strict";
import { test } from "node:test";
import { assertProfileAllowed, getLicenseState } from "../src/license.js";

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
