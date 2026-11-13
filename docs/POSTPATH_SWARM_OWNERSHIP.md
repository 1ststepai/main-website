# PostPath roadmap swarm — file ownership (no collisions)

Base: `origin/main`. Each agent uses a unique branch `cursor/postpath-slice-*-c683` and **must not edit** another agent’s files.

| Agent | Branch | Owns (edit freely) | Must NOT touch |
| --- | --- | --- | --- |
| **A Scheduling** | `cursor/postpath-slice-a-schedule-c683` | `packages/social-mcp/src/engine.js`, `src/index.js`, `src/desk/**`, `bin/social-mcp.js` (due loop flags only), `test/*schedule*`, `test/engine.test.js` (schedule/cancel cases only), README schedule section | `publish/validate.js`, `src/license.js`, `packages/postpath-desktop/**`, launchers except due-loop docs |
| **B Validation** | `cursor/postpath-slice-b-validate-c683` | **New** `packages/social-mcp/src/publish/validate.js`, `test/validate.test.js`, README “validation” subsection | `engine.js`, `index.js`, `desk/**` (parent wires validate later) |
| **C Installer UX** | `cursor/postpath-slice-c-installer-c683` | `packages/social-mcp/scripts/Open-PostPath.*`, `scripts/build-downloads.sh`, `package.json` (`bin` alias only), README Windows/mac first-run | `src/**` except none — no src |
| **D Desktop shell** | `cursor/postpath-slice-d-desktop-c683` | **New** `packages/postpath-desktop/**` only (Electron/Tauri scaffold wrapping existing desk URL) | Anything under `packages/social-mcp/src` |
| **E License stub** | `cursor/postpath-slice-e-license-c683` | **New** `packages/social-mcp/src/license.js`, `test/license.test.js`, `docs/POSTPATH_LICENSING.md` | Do not call paid Stripe/Lemon APIs; default off; no `engine.js` wire (parent later) |
| **Sonar #38** | `cursor/postpath-site-ship-c683` | Fix only the Sonar new issue on that PR’s files | Do not expand scope |

## Integration order (parent)

1. A → B (wire validate into `publishPost`) → C → E soft gate → D optional packaging  
2. Never force-push; open/update separate PRs per branch.

## Hard product rules (all agents)

- Keep MCP tool names as today (`list_accounts`, `create_draft`, …). No `postpath_*` renames.
- Local-first vault stays AES-GCM under `~/.social-mcp`.
- No live social publish in CI; mock `fetch`.
- No enabling GHL forwarding / paid AI APIs.
- Snapchat/WhatsApp stay honestly restricted.
