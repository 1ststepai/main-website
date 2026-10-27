# PostPath release swarm — ownership (2026-10-27)

Integrator branch: `cursor/postpath-release-candidate-da32`  
Base: `origin/main` `57a3821ef085b4fb0665017c9416c8cade7fe6df`  
Rule: one owner per file. Only the integrator merges lanes. Do not open replacement PRs. Do not merge to `main` or deploy.

Prior slice map (PRs #41–#49, already on main) stays historical. This table is the active release-candidate swarm.

| Lane | Owner branch | Worktree | May edit | Must not edit |
| --- | --- | --- | --- | --- |
| 0 Integrator | `cursor/postpath-release-candidate-da32` | `/workspace` | This file, decision log, combined tree after lanes land | Do not race lane edits |
| 1 Quality | `cursor/postpath-sonar-quality-da32` | `/tmp/postpath-lanes/quality` | Sonar bug/vuln files listed in `docs/postpath-lanes/01-quality.md`; duplication targets listed there | `packages/social-mcp/**`, `packages/postpath-desktop/**`, `postpath/**`, `index.html`, `src/home-v2.css`, `work/**`, `tools/**`, `public/downloads/**` |
| 2 Desktop artifacts | `cursor/postpath-desktop-artifacts-da32` | `/tmp/postpath-lanes/desktop` | `packages/postpath-desktop/**`, `packages/social-mcp/scripts/**`, `public/downloads/postpath/**`, `.gitignore` only for download artifact rules | `packages/social-mcp/src/**`, marketing HTML, `test/postpathMarketing.test.js` |
| 3 Publish flow | `cursor/postpath-publish-flow-da32` | `/tmp/postpath-lanes/publish` | `packages/social-mcp/src/**` except `src/license.js`, `packages/social-mcp/test/**` except `test/license.test.js`, `packages/social-mcp/README.md` | `src/license.js`, desktop package, launchers, website |
| 4 Entitlements | `cursor/postpath-entitlements-da32` | `/tmp/postpath-lanes/license` | `packages/social-mcp/src/license.js`, `packages/social-mcp/test/license.test.js`, `docs/POSTPATH_LICENSING.md` | `engine.js`, website, payment SDKs |
| 5 Website | `cursor/postpath-site-funnel-da32` | `/tmp/postpath-lanes/site` | `index.html`, `src/home-v2.css`, `postpath/**`, `work/**`, `tools/**`, footer/nav partials those pages use, `test/postpathMarketing.test.js`, `docs/POSTPATH.md`, `docs/POSTPATH_BRAND.md` | `packages/**`, service-page body copy unrelated to a PostPath link, download zip binaries |
| 6 Customer QA | integrator, after combine | `/workspace` | QA notes under `docs/postpath-lanes/06-qa.md` | No product edits until findings are assigned |

Each lane writes its handoff at `docs/postpath-lanes/0N-*.md` and pushes its branch. The integrator cherry-picks or merges those branches onto the release candidate and reruns gates.

## Reused work (do not replace)

| PR | Head | Use |
| --- | --- | --- |
| #38 | `93a919999fbf03a228bf08a328a752c74e7db7ab` | Homepage, downloads, orbit. Conflicts with main on `index.html`, `postpath/*`, `src/home-v2.css`, `test/postpathMarketing.test.js`, `docs/POSTPATH.md`, `packages/social-mcp/scripts/build-downloads.sh`, `.gitignore`. Reconcile; do not overwrite main’s launcher/build-downloads changes. |
| #50 | `239a456dc8a1906ef9d19aa122d2b52b8a136d59` | CRM **next** copy only. Verify fails because the marketing test expects Mac/Windows zips that this branch does not contain. Not CRM OAuth. |
| #37 #39 #40 | open docs/skill | Absorb useful docs during integration. Do not block the product on them. |

## Hard rules

- No live social publish, no new credentials, no deploy, no paid ads, no payment provider, no GHL forwarding, no repo creation.
- Do not disable Sonar, weaken tests, or raise quality-gate thresholds.
- Download buttons ship a verified artifact or say Request early access. Node-required zips are a developer preview.
- Licensing stays early access until Evan approves a payment provider. The env stub is not paid licensing.
- Snapchat, WhatsApp, and CRM stay honestly restricted or planned.
