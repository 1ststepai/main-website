# Studio handoff — agent handoffs and proof of done

Status: locally verified in this workspace. Not deployed. Not production verified.

## Goal

Give Studio a private, per-project handoff that an agent can pick up without the previous chat, including proof status, a budget-aware tool choice, and honest connection states for the existing Agent Handoff Bridge.

## Current state

Studio at `/admin/` has a Handoffs view. Projects store business, brand notes, tools, budget, decisions, tasks, commit SHAs, and proof separately. The board is encrypted in its own KV record. Copy and download produce one markdown handoff.

The server can read bridge 0.5.0 through `/health` and MCP `tools/call` when the URL and read token are configured. This workspace had neither a running bridge nor the product CLIs, so those live connections were not verified.

## What was verified here

- `npm test`: passed, including `test/adminHandoffs.test.js` (12 tests).
- `npm run build`: completed.
- Unauthenticated `GET /api/admin-handoffs` returns 401.
- With no bridge URL and no KV, an authenticated read returns storage `not_configured`, bridge `not_configured`, and no connection marked connected.
- A local mock of the bridge's `/health` and `/mcp` responses:
  - health without a token stays `health_only` and does not load tasks
  - a read token returns tasks and checkpoints with credential-shaped text redacted
  - a rejected token stays disconnected
  - a private `10.1.1.1` URL is refused before any request
- `node scripts/connect-handoff-agent.mjs studio-read` against that mock, with the token only in an env file, exited 0 as connected and verified. The token was not in stdout.
- `node scripts/connect-handoff-agent.mjs cursor` exited 2 as blocked and did not print a token.
- Codex is connected and verified only when the mock bridge accepts `BRIDGE_CODEX_TOKEN` and the command double reports `bearer-token-env-var` plus the server name. A missing CLI stays setup needed even after the credential is accepted.
- Grok stays setup needed when `grok mcp doctor` fails. The header argument is `${BRIDGE_ENGINEERING_TOKEN}`, not the token value.
- A Codex token present in the server environment is `setup_needed` and `credential_configured`, not connected.
- Encrypted KV storage hides the project name and brand notes. A stale revision is rejected.
- Tool choice on the bridge-read example selects the existing MCP, cost included, savings unknown because the hosted tracker has no price. A $20 adopt is recommended over a $0 custom mailer and stays approval-required until the owner approves. Over budget stays approval-required even after a normal approval.

## Live checks that failed or were unavailable

Checked from this environment on 2026-10-26:

- `http://127.0.0.1:8787/health` did not connect. The real bridge is disconnected here, not healthy.
- `grok`, `codex`, and `cursor` were not on `PATH`. Their desktop or CLI connections were not configured and were not verified.
- No production deploy was performed. Production verification is not claimed.

## Decisions

Reuse the bridge MCP for Studio reads. Do not add a hosted tracker or a second task database for this need. The hosted price was not loaded, so it stays unknown. The custom database has no vendor fee and higher maintenance, and it was not chosen just to avoid a subscription.

Cursor setup is blocked until the bridge has its own Cursor credential. OpenAI Dot stays a manual ChatGPT step. Codex and Grok setup that can be completed on the bridge host goes through `scripts/connect-handoff-agent.mjs`.

Proof levels in Studio are recorded status. They do not re-run tests or confirm a live deployment.

## Budget

No new vendor charge was added. Estimated cost of the chosen bridge read is included with the bridge that already exists. Actual provider usage is unavailable because no usage meter is connected.

## Blockers

- The real bridge process is not running here, and this server has no bridge URL or read token.
- Cursor cannot be connected without a bridge change that adds a distinct Cursor actor.
- ChatGPT cannot be configured from this repository.
- Codex and Grok app install was not verified because those CLIs are absent.

## Next action

On the machine that runs the bridge, set `AGENT_HANDOFF_BRIDGE_URL` and `AGENT_HANDOFF_BRIDGE_READ_TOKEN` for Studio, then run `node scripts/connect-handoff-agent.mjs studio-read` and open Handoffs in the protected Studio to confirm the read. Do not deploy until the release gates for this site are satisfied.

## Source

Repository: this main-website checkout. The commit SHA for this handoff is recorded in the commit that contains this file.
