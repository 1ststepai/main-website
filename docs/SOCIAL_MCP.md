# PostPath by 1stStep.ai (local desktop + MCP)

Product package: `packages/social-mcp` (technical path). Product name: **PostPath**.

Humans use the **desk UI**. Agents use the **MCP server** (`postpath`). Both share the encrypted vault on disk.

## Open the desk

**Windows:** double-click `packages/social-mcp/scripts/Open-PostPath.bat`

```powershell
cd packages\social-mcp
npm install
node .\bin\social-mcp.js app
```

**macOS / Linux:**

```bash
cd packages/social-mcp && npm install && node ./bin/social-mcp.js app
```

Desk: `http://127.0.0.1:47830/`  
OAuth callback: `http://127.0.0.1:47831/oauth/callback`

## Product loop

1. Save Google / Meta / TikTok app credentials in the desk (stored in `~/.social-mcp/oauth.env`)
2. **Connect accounts** — browser chain YouTube → Meta → TikTok
3. **Enable in Cursor** — merges `postpath` into `~/.cursor/mcp.json`
4. Restart Cursor — agents can draft / schedule / publish

## Relationship to studio

| Surface | Role |
| --- | --- |
| `/admin/` Social Desk | Hosted owner control plane for 1stStep brands |
| PostPath | Portable product for any brand / any AI on the user’s machine |

They do not share KV or Blob. Do not point PostPath at production website storage.

## Media paths

YouTube and TikTok publish only accept files under `~/.social-mcp/media`.

Full tool list and security notes: [`packages/social-mcp/README.md`](../packages/social-mcp/README.md)
