# Admin Command Center telemetry contract (Phase 1)

The Command Center lives inside the existing protected `1ststep.ai/admin` Studio. Its UI makes **GET** requests only. It has no deploy, merge, repository mutation, agent-control, audit-acknowledgement, or release-gate actions. The admin session protects reads; a separate publisher credential permits metadata-only telemetry ingestion. The ingestion endpoint is internet-reachable but rejects requests without the source-specific credential.

## Current truth

The first-party ecosystem auditor currently writes immutable audits and manager/loop inbox handoffs to its **local** `state/` directory. Its integration record explicitly says there is no verified live manager/loop subscriber. The public site runs on Vercel and cannot read those local files. No existing central agent registry, heartbeat service, or app-family telemetry publisher has been verified. Consequently, a deployed Command Center will show `UNKNOWN`/unconnected until the authority owners publish evidence under this contract. A worktree is not evidence that an agent is running, and an inbox file is not acknowledgement.

## Source ownership and transport

Two independent producer identities are accepted:

- `public-ecosystem`: Ecosystem Lead / Loop Agent, ecosystem auditor, public-site engineer, OS and Audit agents. The public/ecosystem owner integrates this publisher with canonical local handoff and agent state.
- `app-family`: app.1ststep.ai Engineering Orchestrator, app loop and auditor, app implementation agents, resume and partners implementation. The app orchestrator owns implementation of its publisher and decides which content-free metadata may cross into the public-site admin. This site must not read app-owned stores directly or infer their runtime state.

Each producer sends `POST /api/admin-command-center-ingest` with `Content-Type: application/json` and its own `x-1ststep-command-center-key` credential. Set `FIRSTSTEP_COMMAND_CENTER_PUBLIC_INGEST_SECRET` and `FIRSTSTEP_COMMAND_CENTER_APP_INGEST_SECRET` separately (at least 32 characters) in the site environment and distribute each only to its owner. The existing `KV_REST_API_URL` and `KV_REST_API_TOKEN` store one latest snapshot per source, encrypted with the existing `FIRSTSTEP_DATA_ENCRYPTION_KEY` under a source-specific purpose. Keys are server-side only. The browser cannot publish. Source snapshots replace only their own source's previous record. Do not put secrets, customer data, candidate data, repository contents, or private file paths in telemetry.

Minimum payload:

```json
{
  "schemaVersion": 1,
  "contentFree": true,
  "source": "public-ecosystem",
  "observedAt": "2026-09-13T12:00:00.000Z",
  "registryComplete": false,
  "agents": [],
  "projects": [],
  "events": [],
  "audits": [],
  "handoffs": [],
  "decisions": [],
  "releases": [],
  "builds": []
}
```

All records have bounded identifiers and timestamps. Agents additionally report name, explicit status (`working`, `waiting`, `blocked`, `idle`, or `unknown`), project, task, and owner. Audit records report explicit status, severity, finding count, owner, remediation owner, re-audit status, and an evidence reference. Handoffs report `from`, `to`, explicit status, and delivery/acknowledgement timestamps; `acknowledged` is rejected without **both** timestamps. Releases report status and blocker labels. Build records report status, branch, and commit. Events use `at`, `kind`, `summary`, and project. See `lib/admin/commandCenter.js` for the exact allowlist and field limits.

An agent's stable `id` identifies its durable role; a runtime session is a separate, optional `session` projection. Authority publishers may report `session.health` (`healthy`, `degraded`, `stale`, `unreachable`, `unknown`), `runtime` (provider/runtime label), opaque `sessionId`, `lastCheckpoint` (`id`, `createdAt`), `rotation` (`id`, `state`, `updatedAt`), and up to 12 `history` entries (`sessionId`, `runtime`, `startedAt`, optional `endedAt`, `state`). Missing projection fields render `UNKNOWN`; stale agent reports force session health to unknown. The exact unsupported state is `ROTATION_REQUIRES_RUNTIME_SUPPORT`. Never publish a transcript, bootstrap text, checkpoint contents, credentials, repository path, or cross-project data through this feed. The Command Center only displays this projection; it cannot start, switch, acknowledge, or retire sessions. The future OS backend owner must supply authoritative lifecycle events under the separate OS lifecycle contract in its own authority domain; this UI cannot infer them from a CLI process or open worktree.

`registryComplete: true` is an assertion that the publisher knows the full registered-agent inventory for **its** authority domain. Leave it false if only a subset or an auditor-only snapshot is available. The UI calculates ecosystem-wide registered/working/waiting/blocked/idle counts only when both feeds are fresh and both registries are complete; otherwise totals are `UNKNOWN`. A snapshot or agent older than five minutes is not live. The view polls only while visible, every 30 seconds. Polling the UI does not start or control an AI agent.

This contract is a handoff, not evidence that either publisher is already installed. The first public/ecosystem publisher should extract metadata from canonical agent state and the independent auditor's immutable report/inbox, preserving the distinction between **delivered** and **acknowledged**. The app publisher must be implemented and reviewed by the app Engineering Orchestrator. Both should publish a source heartbeat only when an actual collector runs; do not fabricate agent state or reuse a stale payload with a new `observedAt`.

The bounded `npm run command-center:auditor -- --state-dir <auditor-state-dir>` collector is available for the current independent auditor. It reads report/inbox metadata and prints a content-free dry-run summary. With `--publish`, `FIRSTSTEP_COMMAND_CENTER_INGEST_URL=https://1ststep.ai/api/admin-command-center-ingest`, and the public ingest secret configured in that process, it publishes a public-source snapshot containing verified audits and locally delivered handoffs. It intentionally reports **no active agents**, `registryComplete: false`, and no handoff acknowledgements. The collector does not poll or run autonomously. A later unified public publisher must incorporate this source rather than overwrite it with a separate competing public snapshot.

## Release boundary

This branch is local implementation only. Before production rollout, verify private KV configuration, distinct publisher secrets, the first real publisher, authorization failure cases, local/preview UI, freshness behavior, and rollback. A UI build does not prove live telemetry. Production deployment requires the existing public-site release approval and post-deploy verification.
