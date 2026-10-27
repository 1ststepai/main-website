# Lane 4 — Licensing and entitlements

Owner: license lane (`cursor/postpath-entitlements-da32`).

Public contract: [POSTPATH_LICENSING.md](../POSTPATH_LICENSING.md).

## Decision

The public offer is early access. The current system stays an environment-only stub, off and unlimited by default. `paid` is false and `provider` is null. A `POSTPATH_LICENSE_KEY` sets `keyPresent` and is not verified.

Status: local stub. Do not ship this stub as paid licensing.

Rationale: an enforce flag and a profile cap do not prove a purchase. Calling the stub a paid license would overstate what the product can check.

Evan dependency, exact: choose payment provider, prices, and a signed-key or store verifier before any paid entitlement can ship.

Affected systems: `packages/social-mcp/src/license.js` and its tests. `engine.js` still uses `getLicenseState` and `assertProfileAllowed` only.

Evidence: `npm --prefix packages/social-mcp test`.

Not in this lane: payment SDKs, prices, checkout URLs, seat counts beyond the existing profile limits, network verification, and wiring `assertActionAllowed` into the engine.

## Entitlement state table

`offer` is always `early_access`. `paid` is always `false`. `provider` is always `null`.

| Condition | `status` | `enforce` | `profileLimit` | `keyPresent` | Actions |
| --- | --- | --- | --- | --- | --- |
| Default | `unconfigured` | `false` | `null` (unlimited) | `false` | allowed |
| `POSTPATH_LICENSE_KEY` set, enforce off | `unconfigured` | `false` | unlimited | `true` | allowed |
| `POSTPATH_LICENSE_ENFORCE=true` | `active_stub` | `true` | solo/free `1`, pro `5`, agency `Infinity`, disabled `0` | from key | allowed; still not a purchase |
| Enforce is `1`, `yes`, or anything other than `true` | `unconfigured` | `false` | unlimited | from key | allowed |
| `POSTPATH_LICENSE_REVOKED=true`, enforce off | `revoked` | `false` | unlimited | from key | allowed, plus warning |
| `POSTPATH_LICENSE_REVOKED=true`, enforce on | `revoked` | `true` | stub cap | from key | throws `license_revoked` (403) |
| Past ISO instant, enforce off | `expired` | `false` | unlimited | from key | allowed, plus warning |
| Past ISO instant, enforce on | `expired` | `true` | stub cap | from key | throws `license_expired` (403) |
| Future ISO instant | `unconfigured` or `active_stub` | follows enforce | follows enforce | from key | not expired |
| Unparseable expiry, enforce off | `invalid` | `false` | unlimited | from key | warning, allowed |
| Unparseable expiry, enforce on | `invalid` | `true` | stub cap | from key | warning, throws `license_invalid_expiry` (403) |

`true` is case-insensitive for enforce and revocation. Revocation wins over expiry. An unparseable expiry wins over a past instant. Blank expiry is unset. Early access stays usable whenever enforce is off.

`assertActionAllowed("create_profile" | "publish", entitlement)` is the action gate. Unknown actions throw `license_unknown_action` (400). Profile counts stay on `assertProfileAllowed`, so a disabled stub can still reject a new profile there while `assertActionAllowed` allows the action. The engine calls `create_profile` before a new profile is saved and `publish` before `claimPost`. Defaults still allow both.

## Offline

`getEntitlement(env)` is pure with respect to the network. It does not call `fetch` or open an HTTP client. Tests read the module source and evaluate an env object while `fetch` is replaced.
