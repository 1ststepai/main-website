# PostPath marketing site

- **Product URL:** https://postpath.1ststep.ai/
- **Also:** https://www.1ststep.ai/postpath/
- **Source:** `postpath/index.html`
- **Brand board:** `public/assets/postpath/postpath-brand-board.png` (visual source of truth)

## Domain

Target: **https://postpath.1ststep.ai/** on Vercel project `main-website-repo` (team `1ststep`).

Host rewrites in `vercel.json` (this PR / after merge) map `postpath.1ststep.ai` → `/postpath/*`. Also available at `https://www.1ststep.ai/postpath/`.

### Setup checklist

1. **Merge** the PostPath PR into `main` so production has `/postpath/` + host rewrites.
2. **Vercel → Project → Domains:** add `postpath.1ststep.ai` (no redirect).
3. **Cloudflare DNS** for `1ststep.ai` (nameservers are Cloudflare — not Vercel DNS):

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `postpath` | `0366bb615042ced3.vercel-dns-016.com` | DNS only (or Proxied if you already proxy `www` the same way) |

Use the same CNAME target as `www.1ststep.ai` (currently `0366bb615042ced3.vercel-dns-016.com`). If Vercel shows a different recommended value after the domain is added, use that.

4. Wait for TLS / DNS, then verify:
   - `https://postpath.1ststep.ai/` loads the PostPath marketing page
   - `https://www.1ststep.ai/postpath/` still works

## Conversion

Early access form opens a prefilled email to `evan@1ststep.ai`. No waitlist database on this page yet.

## Related

- Local product: `packages/social-mcp` (desk + MCP)
- Decision log: PostPath marketing site entry
