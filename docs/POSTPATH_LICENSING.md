# PostPath licensing (early access stub)

Local licensing helpers live in `packages/social-mcp/src/license.js`.

The public offer is **early access**. This is an environment-only stub. It is off and unlimited by default. It does not call Stripe, LemonSqueezy, or any other paid verification API. It does not store license keys or secrets in the repository. Do not ship this stub as paid licensing.

`getEntitlement` always reports:

| Field | Value |
| --- | --- |
| `offer` | `early_access` |
| `paid` | `false` |
| `provider` | `null` |

There is no verifier. `POSTPATH_LICENSE_KEY`, when non-empty after trim, sets `keyPresent: true` only. It does not activate a paid plan and it does not change the offer.

## Defaults

| Field | Default |
| --- | --- |
| `status` | `unconfigured` |
| `tier` | `free` |
| `enforce` | `false` |
| `profileLimit` | `null` (unlimited) |
| `keyPresent` | `false` |
| `warnings` | `[]` |

`POSTPATH_LICENSE_ENFORCE` turns the stub on only when the value is `true` (case-insensitive). `1`, `yes`, and every other value leave the product unlimited. The same `true` rule applies to `POSTPATH_LICENSE_REVOKED`.

Enforcement decides whether a revoked, expired, or invalid entitlement blocks `create_profile` and `publish`. It does not turn the stub into a purchase.

## Entitlement states

| Condition | `status` | Profile limit | `create_profile` / `publish` |
| --- | --- | --- | --- |
| Enforce is not `true` | `unconfigured` | unlimited | allowed |
| `POSTPATH_LICENSE_KEY` set, enforce off | `unconfigured` (`keyPresent: true`) | unlimited | allowed |
| Enforce `true` | `active_stub` | solo/free `1`, pro `5`, agency `Infinity`, disabled `0` | allowed |
| `POSTPATH_LICENSE_REVOKED=true`, enforce off | `revoked` | unlimited | allowed, warning `POSTPATH_LICENSE_REVOKED=true.` |
| `POSTPATH_LICENSE_REVOKED=true`, enforce on | `revoked` | stub cap for `POSTPATH_TIER` | throws `license_revoked` (403) |
| `POSTPATH_LICENSE_EXPIRES_AT` is a past ISO instant, enforce off | `expired` | unlimited | allowed, warning that the instant is in the past |
| `POSTPATH_LICENSE_EXPIRES_AT` is a past ISO instant, enforce on | `expired` | stub cap | throws `license_expired` (403) |
| `POSTPATH_LICENSE_EXPIRES_AT` is a future ISO instant | `unconfigured` or `active_stub` | follows enforce | not expired |
| `POSTPATH_LICENSE_EXPIRES_AT` is present but not a valid ISO instant, enforce off | `invalid` | unlimited | allowed, warning |
| `POSTPATH_LICENSE_EXPIRES_AT` is present but not a valid ISO instant, enforce on | `invalid` | stub cap | warning, throws `license_invalid_expiry` (403) |

Precedence is revocation, then an unparseable expiry, then a past expiry, then `active_stub` or `unconfigured`. A blank expiry is unset.

A valid ISO instant is a calendar date, a time, and `Z` or a numeric offset such as `2099-06-15T15:04:05Z`. Date-only values, zoneless values, and dates that roll over (for example February 31) are unparseable. An instant that is exactly the evaluation time is not in the past. Evaluation uses the local clock and does not read the network.

Unknown `POSTPATH_TIER` values warn and use the solo cap (`1`) only when enforce is on. Tier is ignored when enforce is off.

## Soft limits (env-only, when enforce is on)

| `POSTPATH_TIER` | Reported `tier` | Profile limit |
| --- | --- | --- |
| `solo` or `free` | `free` | `1` |
| `pro` | `pro` | `5` |
| `agency` | `agency` | `Infinity` |
| `disabled` | `disabled` | `0` |

These caps are not seat counts and they are not prices. `active_stub` means the local cap is switched on. It is still not a purchase.

## API

### `getLicenseState(env?)`

Returns `{ tier, enforce, profileLimit, warnings }`. Pass a plain env object in tests; the default is `process.env`.

Key, revocation, and expiry do not change this result. Existing callers, including `engine.upsertProfile`, keep the previous stub behavior.

### `getEntitlement(env?)`

Returns `{ offer, paid, provider, enforce, tier, profileLimit, status, warnings, keyPresent }`.

`offer` is `early_access`, `paid` is `false`, and `provider` is `null`. The function reads only the env object and the local clock.

### `assertProfileAllowed(profileCount, state)`

Returns `{ status: 'ok'|'warning'|'error', ok, profileCount, profileLimit, message }` without throwing for soft overages.

Throws `license_profile_limit` (403) only when `state.enforce` is true and `profileCount` is over the hard limit.

### `assertActionAllowed(action, entitlement)`

Accepts `create_profile` or `publish`. Any other action throws `license_unknown_action` (400).

When `entitlement.enforce` is false, both actions are allowed, including revoked, expired, and invalid early access.

When enforce is true, `revoked` throws `license_revoked` (403), `expired` throws `license_expired` (403), and `invalid` throws `license_invalid_expiry` (403). `active_stub` is allowed here; profile caps remain on `assertProfileAllowed`.

`engine.upsertProfile` calls `assertActionAllowed("create_profile")` before the profile cap when the profile is new. `engine.publishPost` calls `assertActionAllowed("publish")` before it claims the post, so a blocked entitlement does not start dispatch. With the default (`enforce=false`) both calls allow the action.

## Engine wiring

`upsert_profile` / `engine.upsertProfile` calls `assertActionAllowed("create_profile")` and then `assertProfileAllowed` when creating a **new** profile. Existing profile updates are always allowed. `publishPost` calls `assertActionAllowed("publish")` before `claimPost`. With defaults (`enforce=false`) these checks allow the action and profiles stay unlimited.

## Evan dependency

Choose payment provider, prices, and a signed-key or store verifier before any paid entitlement can ship.

Until Evan approves that choice, do not add a payment SDK, checkout URL, price, seat count, or network verifier. Do not describe `active_stub` as a paid license.

Do not commit API keys, webhook secrets, or license private keys to this repo. Keep credentials in local env / vault only, and never enable paid AI or billing APIs unless explicitly requested.
