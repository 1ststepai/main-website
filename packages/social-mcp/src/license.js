/**
 * PostPath licensing stub (local-only).
 *
 * The public offer is early access. This module does not verify a purchase,
 * choose a payment provider, or set a price. Paid entitlement needs Evan to
 * choose a provider, prices, and a signed-key or store verifier before it can ship.
 *
 * Evaluation reads the supplied env object and the local clock only.
 * Defaults stay open: enforce=false, unlimited profiles, status unconfigured.
 */

import { mcpError } from "./errors.js";

/** @typedef {'free'|'pro'|'agency'|'disabled'} LicenseTier */
/** @typedef {'unconfigured'|'active_stub'|'revoked'|'expired'|'invalid'} EntitlementStatus */
/** @typedef {'create_profile'|'publish'} LicenseAction */

/** Soft profile caps when POSTPATH_LICENSE_ENFORCE=true (env-only stub). */
const TIER_LIMITS = Object.freeze({
  solo: { tier: /** @type {LicenseTier} */ ("free"), profileLimit: 1 },
  free: { tier: /** @type {LicenseTier} */ ("free"), profileLimit: 1 },
  pro: { tier: /** @type {LicenseTier} */ ("pro"), profileLimit: 5 },
  agency: { tier: /** @type {LicenseTier} */ ("agency"), profileLimit: Infinity },
  disabled: { tier: /** @type {LicenseTier} */ ("disabled"), profileLimit: 0 },
});

const OFFER = "early_access";
const BLOCKED_ACTIONS = Object.freeze({
  revoked: ["license_revoked", "PostPath license is revoked."],
  expired: ["license_expired", "PostPath license is expired."],
  invalid: ["license_invalid_expiry", "POSTPATH_LICENSE_EXPIRES_AT is not a valid ISO instant."],
});

/** Calendar date, time, and Z or a numeric offset. Date-only values are not instants. */
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/i;

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined> | undefined | null} env
 */
function envSource(env) {
  return env && typeof env === "object" ? env : process.env;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} source
 * @param {string} name
 */
function flagTrue(source, name) {
  return String(source?.[name] || "").toLowerCase() === "true";
}

/**
 * @param {RegExpExecArray} match
 */
function instantMatchesCalendar(match) {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  const zone = String(match[8]).toUpperCase();
  let offsetMinutes = 0;
  if (zone !== "Z") {
    const sign = zone.startsWith("-") ? -1 : 1;
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 23 || zoneMinute > 59) return false;
    offsetMinutes = sign * (zoneHour * 60 + zoneMinute);
  }

  const parsed = Date.parse(match[0]);
  if (!Number.isFinite(parsed)) return false;
  const shifted = new Date(parsed + offsetMinutes * 60 * 1000);
  return (
    shifted.getUTCFullYear() === year &&
    shifted.getUTCMonth() + 1 === month &&
    shifted.getUTCDate() === day &&
    shifted.getUTCHours() === hour &&
    shifted.getUTCMinutes() === minute &&
    shifted.getUTCSeconds() === second
  );
}

/**
 * @param {string | undefined} value
 * @param {number} nowMs
 * @returns {'unset'|'future'|'past'|'invalid'}
 */
function classifyExpiry(value, nowMs) {
  if (value == null) return "unset";
  const raw = String(value).trim();
  if (!raw) return "unset";
  const match = ISO_INSTANT.exec(raw);
  if (!match || !instantMatchesCalendar(match)) return "invalid";
  const parsed = Date.parse(match[0]);
  if (!Number.isFinite(parsed)) return "invalid";
  return parsed < nowMs ? "past" : "future";
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined> | undefined} [env]
 * @returns {{
 *   tier: LicenseTier,
 *   enforce: boolean,
 *   profileLimit: number | null,
 *   warnings: string[],
 * }}
 */
export function getLicenseState(env = process.env) {
  const source = envSource(env);
  const warnings = [];
  const enforce = flagTrue(source, "POSTPATH_LICENSE_ENFORCE");

  if (!enforce) {
    return {
      tier: "free",
      enforce: false,
      profileLimit: null,
      warnings,
    };
  }

  const rawTier = String(source.POSTPATH_TIER || "solo").trim().toLowerCase();
  const mapped = TIER_LIMITS[rawTier];

  if (!mapped) {
    warnings.push(`Unknown POSTPATH_TIER "${rawTier}"; defaulting to solo (1 profile).`);
    return {
      tier: "free",
      enforce: true,
      profileLimit: 1,
      warnings,
    };
  }

  return {
    tier: mapped.tier,
    enforce: true,
    profileLimit: mapped.profileLimit === Infinity ? Infinity : mapped.profileLimit,
    warnings,
  };
}

/**
 * Local early-access entitlement. `paid` stays false and `provider` stays null.
 * A license key is recorded as `keyPresent` and is not verified.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined> | undefined} [env]
 * @returns {{
 *   offer: 'early_access',
 *   paid: false,
 *   provider: null,
 *   enforce: boolean,
 *   tier: LicenseTier,
 *   profileLimit: number | null,
 *   status: EntitlementStatus,
 *   warnings: string[],
 *   keyPresent: boolean,
 * }}
 */
export function getEntitlement(env = process.env) {
  const source = envSource(env);
  const license = getLicenseState(source);
  const warnings = [...license.warnings];
  const expiry = classifyExpiry(source.POSTPATH_LICENSE_EXPIRES_AT, Date.now());
  const revoked = flagTrue(source, "POSTPATH_LICENSE_REVOKED");

  if (expiry === "invalid") {
    warnings.push("POSTPATH_LICENSE_EXPIRES_AT is not a valid ISO instant.");
  } else if (expiry === "past") {
    warnings.push("POSTPATH_LICENSE_EXPIRES_AT is in the past.");
  }
  if (revoked) {
    warnings.push("POSTPATH_LICENSE_REVOKED=true.");
  }

  let status = license.enforce ? "active_stub" : "unconfigured";
  if (expiry === "past") status = "expired";
  if (expiry === "invalid") status = "invalid";
  if (revoked) status = "revoked";

  return {
    offer: OFFER,
    paid: false,
    provider: null,
    enforce: license.enforce,
    tier: license.tier,
    profileLimit: license.profileLimit,
    status,
    warnings,
    keyPresent: String(source.POSTPATH_LICENSE_KEY || "").trim() !== "",
  };
}

/**
 * Check whether the current profile count is allowed under the license state.
 * Does not throw unless enforce is on and the count exceeds the hard profile limit.
 *
 * @param {number} profileCount
 * @param {{
 *   tier?: LicenseTier,
 *   enforce?: boolean,
 *   profileLimit?: number | null,
 *   warnings?: string[],
 * }} state
 * @returns {{
 *   status: 'ok' | 'warning' | 'error',
 *   ok: boolean,
 *   profileCount: number,
 *   profileLimit: number | null,
 *   message: string | null,
 * }}
 */
export function assertProfileAllowed(profileCount, state) {
  const count = Number(profileCount);
  if (!Number.isFinite(count) || count < 0) {
    throw mcpError("license_invalid_count", "profileCount must be a non-negative number.", 400);
  }

  const enforce = Boolean(state?.enforce);
  const limit = state?.profileLimit;
  const unlimited = limit == null || limit === Infinity;

  if (unlimited) {
    return {
      status: "ok",
      ok: true,
      profileCount: count,
      profileLimit: limit == null ? null : Infinity,
      message: null,
    };
  }

  if (count < limit) {
    return {
      status: "ok",
      ok: true,
      profileCount: count,
      profileLimit: limit,
      message: null,
    };
  }

  if (count === limit) {
    return {
      status: "warning",
      ok: true,
      profileCount: count,
      profileLimit: limit,
      message: `At profile limit (${limit}) for tier "${state?.tier || "unknown"}".`,
    };
  }

  const message = `Profile limit exceeded (${count}/${limit}) for tier "${state?.tier || "unknown"}".`;

  if (enforce) {
    throw mcpError("license_profile_limit", message, 403);
  }

  return {
    status: "error",
    ok: false,
    profileCount: count,
    profileLimit: limit,
    message,
  };
}

/**
 * Action gate for a later integrator. Profile caps stay on `assertProfileAllowed`.
 * When `enforce` is false, `create_profile` and `publish` are allowed.
 *
 * @param {string} action
 * @param {{
 *   enforce?: boolean,
 *   status?: EntitlementStatus,
 * }} entitlement
 * @returns {{ ok: true, action: LicenseAction, status: EntitlementStatus | string }}
 */
export function assertActionAllowed(action, entitlement) {
  if (action !== "create_profile" && action !== "publish") {
    throw mcpError("license_unknown_action", `Unknown license action "${String(action)}".`, 400);
  }

  const status = entitlement?.status || (entitlement?.enforce ? "active_stub" : "unconfigured");
  if (!entitlement?.enforce) {
    return { ok: true, action, status };
  }

  const block = BLOCKED_ACTIONS[status];
  if (block) {
    throw mcpError(block[0], block[1], 403);
  }

  return { ok: true, action, status };
}
