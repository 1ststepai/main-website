# PostPath desktop shell

Thin **Electron** wrapper around the existing PostPath desk in `packages/social-mcp`.

This package does **not** fork connect / vault / publish / MCP logic. It only:

1. Ensures the local desk is running (`node …/social-mcp.js app --no-open`)
2. Opens `http://127.0.0.1:47830/` in a `BrowserWindow`

## Brand

Shell chrome uses the PostPath **Midnight** canvas (`#0B1020`). Product UI remains the desk. Do not redesign or replace the locked 1stStep.ai logo; PostPath keeps its own mark from the brand kit.

## Prerequisites

- Node.js 20+
- `packages/social-mcp` installable (`npm install` in that package)
- Electron (optionalDependency — install when you want the native window)

## How to run

From the repo root:

```bash
# 1) Desk dependencies (once)
cd packages/social-mcp && npm install && cd ../..

# 2) Desktop shell + Electron
cd packages/postpath-desktop
npm install
npm start
```

`npm start` runs `electron .`, which:

- Spawns `node packages/social-mcp/bin/social-mcp.js app --no-open` if nothing is already listening on port `47830`
- Loads `http://127.0.0.1:47830/` in the shell window
- Leaves MCP alone — Cursor/Claude still talk to the `postpath` MCP server separately

### Desk only (no Electron)

```bash
cd packages/postpath-desktop
npm run desk
# or: node ../social-mcp/bin/social-mcp.js app
```

### Environment overrides

| Variable | Purpose |
| --- | --- |
| `POSTPATH_NODE` | Node binary (default `node`; required under Electron so we do not re-exec the Electron binary) |
| `POSTPATH_SOCIAL_MCP_BIN` | Absolute path to `social-mcp.js` |
| `SOCIAL_MCP_DESK_PORT` | Desk port (default `47830`) |
| `POSTPATH_DESK_READY_MS` | Ready-poll timeout (default `45000`) |

If `npm start` fails with “Cannot find module 'electron'”, run `npm install` in this package (Electron is an `optionalDependency` so lightweight CI/agents can skip the download).

## Vault (unchanged)

Credentials and tokens stay local in **`~/.social-mcp`** (override with `SOCIAL_MCP_HOME`). This shell does not move or re-encrypt the vault.

## This does not replace MCP

| Piece | Role |
| --- | --- |
| This package | Human-facing native window around the desk |
| `social-mcp app` / desk | Connect UI on localhost |
| `social-mcp` / `postpath` MCP | Agent draft / schedule / publish |

Agents continue to use the MCP server. The desktop shell is optional chrome for humans.

## Out of scope (future)

- Code signing / notarization
- Auto-update
- Paid distribution infra
- Forking desk or engine business logic into this package

## License

Proprietary / UNLICENSED — same packaging decision as PostPath / social-mcp.
