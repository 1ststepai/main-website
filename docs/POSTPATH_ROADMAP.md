# PostPath implementation roadmap (grounded)

**Canonical product package:** `packages/social-mcp`  
**MCP server key:** `postpath`  
**Vault:** `~/.social-mcp` (AES-256-GCM envelopes + `oauth.env`)  
**Human UI:** local desk `social-mcp app` → `http://127.0.0.1:47830/`  
**Marketing:** `https://postpath.1ststep.ai/`

This document maps an aspirational phase plan onto **what already exists**, what must **not** be reinvented without an owner decision, and the **next execution slices**. Do not invent tool names, platforms, or paid services beyond this map.

---

## Principles (locked by decision log)

1. **Local-first:** Tokens stay on the user’s machine. No cloud token store.
2. **MCP for agents:** Stdio MCP tools under server key `postpath`.
3. **Desk for humans:** Connect + credentials + Enable in Cursor; humans do not paste MCP JSON.
4. **Honest platform limits:** Snapchat / WhatsApp stay restricted until APIs allow; TikTok often `handed_off` (inbox); Instagram/Facebook need https `media_url`.
5. **Schedule is local:** `schedule_post` stores a vault row; something must later call `publish_due` while PostPath is running. No implied 24/7 cloud scheduler today.

---

## Reality check vs aspirational phases

### Phase 1 — Core MCP & encrypted vault (MVP)

| Roadmap item | Status | Actual location / notes |
| --- | --- | --- |
| Encrypted local vault | **Done** | `src/crypto.js` AES-256-GCM (`smcp_enc_v1`); `master.key` or `SOCIAL_MCP_ENC_KEY`; connection secrets in `db.json` |
| OS keychain (`keytar`) | **Not started** | Optional hardening; not required for MVP. Needs OS packaging + owner approval to add native dep |
| SQLite metadata | **Not started** | JSON vault is intentional today; migrate only with migration plan |
| X OAuth PKCE + tweet | **Done** | `oauth/providers.js`, `publish/x.js` |
| LinkedIn member text post | **Done** | Member UGC/text path; **company page** posts not verified as first-class |
| Bluesky app password | **Done** | `connect_bluesky`, `publish/bluesky.js` |
| YouTube upload | **Done** | `media_path` under vault `media/` |
| MCP stdio server | **Done** | `@modelcontextprotocol/sdk`, `src/index.js` |
| Tools `postpath_list_accounts` / `postpath_publish_post` | **Different names — do not rename lightly** | Real tools below. Renaming breaks Cursor skills + existing installs |
| CLI `postpath auth login` | **Partial** | `social-mcp app` / `connect` / `status` / `install-cursor` — not a separate `postpath-cli` binary |

**Real MCP tools today (complete list):**

`status`, `upsert_profile`, `list_accounts`, `connect_accounts`, `connect_bluesky`, `create_draft`, `update_draft`, `schedule_post`, `publish_post`, `publish_due`, `list_posts`, `get_post_status`

Agent workflow skill: `.cursor/skills/postpath-publishing/SKILL.md` (PR #37).

### Phase 2 — Multi-platform & scheduling

| Roadmap item | Status | Notes |
| --- | --- | --- |
| Instagram / Facebook (Meta) | **Done (constraints)** | Requires https `media_url`; may `handed_off` |
| TikTok upload | **Done (handoff)** | Creator inbox; status `handed_off` |
| Reddit | **Done** | `tags[0]` = subreddit |
| Google Business | **Done** | Local post text |
| Threads / Pinterest | **Done** | See README platform table |
| Snapchat / WhatsApp | **Scaffold only** | Honest API-restricted errors |
| Background scheduling daemon | **Gap** | Schedule exists; **no always-on daemon**. `publish_due` must be invoked while process runs |
| Retry / backoff | **Partial** | Per-publish error → `failed`; no dedicated retry queue worker |
| Pre-publish validation (length / aspect) | **Partial** | Field length caps; no video aspect checks |
| `postpath_schedule_post` / `list_queue` / `cancel` | **Partial** | `schedule_post`, `list_posts` exist; **no cancel tool** yet |

### Phase 3 — Desktop shell (Electron / Tauri)

| Roadmap item | Status | Notes |
| --- | --- | --- |
| Polished desk for non-devs | **Partial** | Localhost desk + OS launchers (`.bat` / zip downloads in PR #38) — **not** Electron/Tauri |
| Brand theme | **Done (marketing + desk)** | Midnight / Electric / Violet / Sunrise on marketing; desk uses PostPath brand |
| Queue UI | **Gap** | Desk focuses on connect/credentials; post queue is MCP/`list_posts` |
| Auto mcp.json snippets | **Partial** | **Enable in Cursor** writes `postpath` into `~/.cursor/mcp.json`; Claude/Windsurf snippets not generated |
| Code signing / auto-update | **Not started** | Needs Apple/Windows certs + paid infra — **owner approval** |

**Decision gate:** Electron/Tauri is a product choice. Current approved surface is the local desk. Do not start a second shell without Evan’s approval.

### Phase 4 — Monetization & multi-brand

| Roadmap item | Status | Notes |
| --- | --- | --- |
| Multi-profile vault | **Done (unlimited local)** | `upsert_profile` + `profile_id` on drafts — no license gate |
| LemonSqueezy / Stripe license | **Not started** | **Paid service + pricing decision — Evan approval required** |
| Solo / Pro / Agency tiers | **Marketing intent only** | Early access messaging; no enforcement in code |
| Team vault export/import | **Not started** | |

---

## Do not do (without a new owner decision)

1. **Rename MCP tools** to `postpath_*` prefixes (breaks installs + publishing skill).
2. **Rewrite vault** to keytar/SQLite as a big-bang (optional additive hardening only).
3. **Claim CRM / HubSpot / Salesforce / GHL** as shipping product surfaces until implemented and verified (CRM WIP is experimental, separate from this roadmap).
4. **Add paid APIs or license servers** without pricing approval.
5. **Imply 24/7 scheduling** until a real local daemon (or optional user-owned always-on runner) exists.
6. **Replace the desk with Electron** while silently abandoning the localhost desk.

---

## Execution strategy (build on `packages/social-mcp`)

### Slice A — Scheduling reliability (highest product value)

1. Add optional local **due-publisher** loop in `social-mcp app` (interval `publish_due` while desk runs).
2. MCP tool `cancel_scheduled_post` (or `update_draft` status clear) + desk queue list.
3. Document offline honesty in desk UI copy.
4. Tests: schedule → time advance → due publish with mocked fetch.

### Slice B — Publish quality & validation

1. Platform-specific caption length warnings before `publish_post`.
2. Clearer `handed_off` vs `published` messaging in desk/MCP results.
3. LinkedIn **organization** page path only if API scopes + verification available.

### Slice C — Installer path (no Electron yet)

1. Land Mac/Windows zip downloads (PR #38).
2. Improve first-run README / Node check UX.
3. Optional: `postpath` npm bin alias → `social-mcp` without renaming package.

### Slice D — Desktop shell (only after approval)

1. Choose Electron **or** Tauri (not both).
2. Embed existing desk or reuse its APIs; do not fork business logic.
3. Code signing budget + auto-update host.

### Slice E — Monetization (only after approval)

1. Pricing + license vendor choice (Stripe vs LemonSqueezy).
2. Soft limits first (warn), then hard gates.
3. Keep free single-profile local publish path honest.

---

## Tool mapping (aspirational → real)

| Aspirational name | Use instead |
| --- | --- |
| `postpath_list_accounts` | `list_accounts` (+ `status`) |
| `postpath_publish_post` | `create_draft` → `publish_post` (one platform per draft today) |
| `postpath_get_post_status` | `get_post_status` |
| `postpath_schedule_post` | `create_draft` → `schedule_post` |
| `postpath_list_queue` | `list_posts` with `status: "scheduled"` |
| `postpath_cancel_scheduled_post` | **Missing — Slice A** |

Multi-platform publish in one MCP call is **not** implemented; create one draft per platform (skill documents this).

---

## Open PRs / adjacent work

| Work | PR / location | Note |
| --- | --- | --- |
| Publishing Cursor skill | #37 | Real tools only |
| Homepage spot + Mac/Windows downloads + orbit | #38 | Merge to put live |
| CRM / calendar WIP | stash on `postpath-crm-*` | Not product roadmap; separate decision |

---

## Recommended next action

1. **Merge #38** (site + downloads) and **#37** (publishing skill).
2. Implement **Slice A** (desk due-publisher + cancel scheduled) on `packages/social-mcp`.
3. Hold Electron, keytar, Stripe/LemonSqueezy until Evan explicitly approves.

**Verification standard:** unit tests in `packages/social-mcp`; no live social publish claimed from CI; production site changes need deploy approval.
