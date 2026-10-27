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

The customer path is a visitor-initiated email to `evan@1ststep.ai`. The form opens that mailto. Nothing is stored on this page. There is no Mac or Windows zip on the marketing page, and the primary button is **Request early access**.

## Platform claims

Public copy uses three groups:

- Built in the local app, real-account acceptance not claimed: X, LinkedIn, Bluesky, YouTube, Instagram, Facebook, TikTok (inbox handoff), Reddit, Google Business, Threads, Pinterest.
- Restricted, and not a send target: Snapchat, WhatsApp. Use text labels, not their logos.
- Planned, and not in the app: HubSpot, Salesforce, GoHighLevel, Pipedrive. Text only. No CRM account login is offered.

A logo on the page is not a claim that production publishing works. The on-page desk is a simulated demo and is labeled Simulated.

## Related

- Local product: `packages/social-mcp` (desk + MCP)
- Decision log: PostPath marketing site entry
