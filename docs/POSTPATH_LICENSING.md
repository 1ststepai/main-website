# PostPath licensing (stub)

Local licensing helpers live in `packages/social-mcp/src/license.js`.

This is a **stub only**. It does not call Stripe, LemonSqueezy, or any other paid verification API. It does not store license keys or secrets in the repository.

## Defaults (product stays free locally)

| Field | Default |
| --- | --- |
| `tier` | `free` |
| `enforce` | `false` |
| `profileLimit` | `null` (unlimited) |

Enforcement turns on **only** when `POSTPATH_LICENSE_ENFORCE=true` (exact string, case-insensitive). Any other value leaves the product unlimited.

## Soft limits (env-only, when enforce is on)

| `POSTPATH_TIER` | Reported `tier` | Profile limit |
| --- | --- | --- |
| `solo` or `free` | `free` | `1` |
| `pro` | `pro` | `5` |
| `agency` | `agency` | `Infinity` |
| `disabled` | `disabled` | `0` |

Unknown tiers warn and fall back to the solo cap (`1`).

## API

### `getLicenseState(env?)`

Returns `{ tier, enforce, profileLimit, warnings }`. Pass a plain env object in tests; defaults to `process.env`.

### `assertProfileAllowed(profileCount, state)`

Returns `{ status: 'ok'|'warning'|'error', ok, profileCount, profileLimit, message }` without throwing for soft overages.

Throws `license_profile_limit` (403) **only** when `state.enforce` is true and `profileCount` is over the hard limit.

## Engine wiring

`upsert_profile` / `engine.upsertProfile` calls `assertProfileAllowed` when creating a **new** profile. Existing profile updates are always allowed. With defaults (`enforce=false`) this is a no-op and profiles stay unlimited.

## Paid verification (not implemented)

Wiring real paid license checks (Stripe, LemonSqueezy, signed keys, etc.) needs **Evan's approval** before any network client, secret, or billing dependency is added.

Do not commit API keys, webhook secrets, or license private keys to this repo. Keep credentials in local env / vault only, and never enable paid AI or billing APIs unless explicitly requested.
