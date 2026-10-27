/**
 * PostPath licensing stub (local-only).
 *
 * No Stripe, LemonSqueezy, or other paid verification network calls.
 * Paid license verification requires Evan's approval before implementation.
 *
 * Defaults keep the product free locally: enforce=false, unlimited profiles.
 */

import { mcpError } from "./errors.js";

/** @typedef {'free'|'pro'|'agency'|'disabled'} LicenseTier */

/** Soft profile caps when POSTPATH_LICENSE_ENFORCE=true (env-only stub). */
const TIER_LIMITS = Object.freeze({
  solo: { tier: /** @type {LicenseTier} */ ("free"), profileLimit: 1 },
  free: { tier: /** @type {LicenseTier} */ ("free"), profileLimit: 1 },
  pro: { tier: /** @type {LicenseTier} */ ("pro"), profileLimit: 5 },
  agency: { tier: /** @type {LicenseTier} */ ("agency"), profileLimit: Infinity },
  disabled: { tier: /** @type {LicenseTier} */ ("disabled"), profileLimit: 0 },
});

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
  const source = env && typeof env === "object" ? env : process.env;
  const warnings = [];
  const enforce = String(source.POSTPATH_LICENSE_ENFORCE || "").toLowerCase() === "true";

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

  // count > limit
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
