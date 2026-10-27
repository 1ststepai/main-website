# Lane 3 — Publish, schedule, cancel

Owner: publish lane (`packages/social-mcp` engine, publishers, desk schedule copy, this note).

Branch: `cursor/postpath-publish-flow-da32`.

No live OAuth apps were created. No real social post was sent. Platform HTTP in tests is mocked `fetch` only.

## Dispatch rule

1. `publish_post` re-reads the row and claims it (`draft`, `scheduled`, or `failed` → `publishing`) immediately before any platform request. `publish_due` claims only from `scheduled`.
2. If cancel changes `scheduled` → `draft` before that claim, the publish does not call `fetch`.
3. Two overlapping `publish_post` calls for one id produce one dispatch. The other fails with `dispatch_started`.
4. Cancel of `publishing` or `needs_review` fails with `dispatch_started`. The row is not put back to `draft` and the platform post is not described as undone.
5. On `publish_due` startup, rows already `publishing` and not claimed in this process move to `needs_review` and are not sent.
6. Outcome classes:
   - Publish request never sent (validation, or token refresh failed before the publish URL) → `failed`. Explicit `publish_post` may retry. `publish_due` does not.
   - Publish request sent and the outcome is unknown (network throw or HTTP 5xx on the publish call) → `needs_review`. `publish_due` skips it. `publish_post` sends again only with `acknowledge=true` (default off). `force=true` does not acknowledge.
   - HTTP 429 → `failed` / `rate_limited`, no retry loop.
   - HTTP 401 → one refresh and one retry where that publisher has a refresh path. A second 401 sets the connection `status` to `needs_reconnect` and stops. `invalid_grant` or a revoked refresh stops without another publish call.

`scheduled_at` must include `Z` or `±hh:mm`. It is stored as UTC. The same profile and platform cannot have two scheduled posts at the same UTC instant, so a fall-back wall clock written two ways cannot double-book one instant. A timestamp with no offset is rejected (including a spring-forward wall time such as `2026-03-08T02:30:00`).

## Platform status

Real-account acceptance is not claimed.

| Platform | Status | Refresh |
| --- | --- | --- |
| YouTube | implemented, mock-tested | Google refresh token; 401 refreshes once |
| Instagram | implemented, mock-tested | No page refresh token. 401 → `needs_reconnect`, no retry |
| Facebook | implemented, mock-tested | Same Meta page token rule as Instagram |
| TikTok | handoff to creator inbox, mock-tested | Login Kit refresh token; 401 refreshes once |
| LinkedIn | implemented, mock-tested | Refresh token; 401 refreshes once |
| X | implemented, mock-tested | Refresh token; 401 refreshes once |
| Threads | implemented, mock-tested | Long-lived token via `th_refresh_token` (connect stores an empty `refresh_token`). 401 refreshes once |
| Pinterest | implemented, mock-tested | Refresh token was stored and is now used on expiry and on 401 |
| Bluesky | implemented, mock-tested | App-password session, then `refreshSession` once on 401 |
| Google Business | implemented, mock-tested | Google refresh token; 401 refreshes once |
| Reddit | implemented, mock-tested | Refresh token; 401 refreshes once |
| Snapchat | restricted scaffold | Refresh token may be stored at connect. Publish does not call Snapchat, so it does not refresh |
| WhatsApp Channels | restricted scaffold | No refresh token and no free publish API |

## Desk

Scheduled posts still have Cancel. The scheduled panel states that after dispatch starts, PostPath cannot guarantee the platform did not accept the post, and that those rows stay needs review and are not auto-retried or undone.

## Not in this lane

License checks, desktop packaging, the public website, live credentials, and a production deploy were not changed.
