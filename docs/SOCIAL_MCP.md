# Social MCP (local product)

Standalone MCP connector in `packages/social-mcp`. Any AI client that speaks MCP can manage social accounts for any profile without routing through the website admin or a paid aggregator.

See the package README for install, Cursor config, tools, and security notes:

[`packages/social-mcp/README.md`](../packages/social-mcp/README.md)

## Relationship to studio social queue

| Surface | Role |
| --- | --- |
| `/admin/` Social Desk | Hosted owner control plane for 1stStep brands (KV, Blob transit, score gates) |
| `packages/social-mcp` | Local product: encrypted vault on disk, browser OAuth chain, MCP tools for any agent |

They share platform knowledge (YouTube / Meta / TikTok) but not storage. Do not point the MCP at production KV.

## Redirect URI

```text
http://127.0.0.1:47831/oauth/callback
```

Override port with `SOCIAL_MCP_OAUTH_PORT` if needed, and update every developer console to match.
