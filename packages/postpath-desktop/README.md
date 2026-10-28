# PostPath desktop shell

The Windows customer artifact is an unsigned internal preview installer. It bundles Electron and the desk, so a customer does not install Node.js or run npm. It is not Authenticode-signed. Leave SmartScreen on. Details, the macOS plan, and updates are in `docs/POSTPATH_INSTALL.md`.

For development, this package is still a thin Electron wrapper around `packages/social-mcp`. A local checkout uses system Node.js unless you run the Windows installer.

This package does **not** fork connect / vault / publish / MCP logic. It only:

1. Ensures the local desk is running (`node …/social-mcp.js app --no-open`)
2. Opens `http://127.0.0.1:47830/` in a `BrowserWindow`

## Brand

Shell chrome uses the PostPath **Midnight** canvas (`#0B1020`). Product UI remains the desk. Do not redesign or replace the locked 1stStep.ai logo; PostPath keeps its own mark from the brand kit.

## Prerequisites

- Node.js 20+ (this remains a developer preview until that requirement is gone)
- `packages/social-mcp` installable (`npm install` in that package)
- Electron (optionalDependency — install when you want the native window)

Versioned Mac and Windows developer-preview zips are built by `packages/social-mcp/scripts/build-downloads.sh`. They are the same kind of preview: Node.js 20+, unsigned, not a one-click installer. Install, relaunch, upgrade, vault, and uninstall for that zip layout are documented in `docs/postpath-lanes/02-desktop.md`.

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

## Shell security

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`
- The window may navigate only to the local desk origin (`http://127.0.0.1:47830/` unless `SOCIAL_MCP_DESK_PORT` is set)
- `will-navigate`, `will-redirect`, and `setWindowOpenHandler` use the same rule: other `http:` / `https:` URLs go to `shell.openExternal`; anything else is dropped. New Electron windows are not created
- Desk stdout/stderr lines containing `token`, `secret`, `password`, `authorization`, `api_key`, or `oauth` are redacted before they are written

## Vault (unchanged)

Credentials and tokens stay local in **`~/.social-mcp`** (override with `SOCIAL_MCP_HOME`). This shell does not move, re-encrypt, or delete the vault. Uninstalling the zip layout or this checkout does not remove `~/.social-mcp`.

## This does not replace MCP

| Piece | Role |
| --- | --- |
| This package | Human-facing native window around the desk |
| `social-mcp app` / desk | Connect UI on localhost |
| `social-mcp` / `postpath` MCP | Agent draft / schedule / publish |

Agents continue to use the MCP server. The desktop shell is optional chrome for humans.

## Signing

No certificate is stored in this repo. `scripts/build-windows-installer.sh` signs only when `CSC_LINK` is a path to a `.pfx`, `CSC_KEY_PASSWORD` is set, and `osslsigncode` can verify the installer. Otherwise the output stays the unsigned internal preview and SmartScreen stays on. Buy or provide an Authenticode certificate (EV if the goal is fewer SmartScreen warnings). Do not commit the certificate. There is still no Apple Developer ID here, so there is no Mac app and Gatekeeper stays on.

## Tests

```bash
cd packages/postpath-desktop
npm test
```

The node tests do not launch Electron. They check navigation/redaction policy, that the download manifest checksums match the zip bytes, and that launchers do not contain credential literals.

## Out of scope (future)

- Code signing / notarization (no certificate in this environment)
- Auto-update
- Paid distribution infra
- Forking desk or engine business logic into this package

## License

Proprietary / UNLICENSED — same packaging decision as PostPath / social-mcp.
