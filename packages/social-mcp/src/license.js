/**
 * PostPath is free.
 *
 * There is no billing, paywall, plan, or profile cap. Environment flags such as
 * POSTPATH_LICENSE_ENFORCE, POSTPATH_TIER, and POSTPATH_LICENSE_KEY are ignored.
 * Evaluation does not call a payment provider.
 */

import { mcpError } from "./errors.js";

const KNOWN_ACTIONS = new Set(["create_profile", "publish"]);

export function getLicenseState() {
  return {
    tier: "free",
    enforce: false,
    profileLimit: null,
    warnings: [],
  };
}

export function getEntitlement() {
  return {
    offer: "free",
    paid: false,
    provider: null,
    enforce: false,
    tier: "free",
    profileLimit: null,
    status: "free",
    warnings: [],
    keyPresent: false,
  };
}

export function assertProfileAllowed(profileCount) {
  const count = Number(profileCount);
  if (!Number.isFinite(count) || count < 0) {
    throw mcpError("license_invalid_count", "profileCount must be a non-negative number.", 400);
  }
  return {
    status: "ok",
    ok: true,
    profileCount: count,
    profileLimit: null,
    message: null,
  };
}

export function assertActionAllowed(action) {
  if (!KNOWN_ACTIONS.has(action)) {
    throw mcpError("license_unknown_action", `Unknown license action "${String(action)}".`, 400);
  }
  return { ok: true, action, status: "free" };
}
