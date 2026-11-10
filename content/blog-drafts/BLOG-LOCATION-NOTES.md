# Where would 1stStep.ai blog posts live? (checked Nov 10, 2026, read-only)

## Finding: www.1ststep.ai has no blog or CMS today
- https://www.1ststep.ai/ → 200 (Vercel). https://www.1ststep.ai/blog and /blog/ → **404**. /guides/ → **404**.
- sitemap.xml lists 25 URLs (home, /os, /postpath, /journey, /book, /work, /pricing, /fit-check, /campaigns/*, /tools/*, /services/*.html, privacy, terms). **No blog, guides or article URLs.**
- Repo github.com/1ststepai/main-website (public, default branch `main`) is a **static multi-page Vite site** (plain HTML pages + React/Tailwind islands), deployed on Vercel. Every page is a hand-written `.../index.html` that's registered in `vite.config.js` → `build.rollupOptions.input`, with clean-URL rewrites in `vercel.json`.
- Of the repo's 489 files, **none** is a blog route, markdown/MDX content folder or CMS config. No `blog` branch, and no open PR adds one. (.agents/skills/firststep/content-clusters.md is only agent guidance.)
- Old GoHighLevel website "Custom Business Infrastructure & AI by Evan Pancis" (home-277197) has a Blog page at /blog-1321. It has no domain connected, and Evan wants it left as is. **Not a viable home for new posts.**

## Where posts would live (recommended)
A new section on the main site, served from www.1ststep.ai, e.g.:
- `/guides/` index → `guides/index.html`
- `/guides/follow-up-every-lead-faster/` → `guides/follow-up-every-lead-faster/index.html` (lead post)
- `/guides/how-to-choose-a-web-designer/` → `guides/how-to-choose-a-web-designer/index.html`
- AI Course post under the course area once /course exists (currently a #course section on the homepage), e.g. `/course/why-pay-for-an-ai-course/`
(`/guides/` matches the slugs already proposed in the drafts. `/blog/` works too, but it's Evan's call.)

## What it takes (via a DRAFT PR only, not created)
1. Add `guides/index.html` plus one `guides/<slug>/index.html` per post, converted from the markdown drafts, using the existing site header/footer/CSS.
   - Optional: a tiny build step that renders `content/guides/*.md` to HTML, so future posts are markdown-only.
2. Register each page in `vite.config.js` `rollupOptions.input`, and add it to the dev `serveExactIndexPaths` routes list.
3. Add `vercel.json` rewrites for `/guides` and each slug.
4. Add the URLs to `sitemap.xml`. Add Article/BreadcrumbList JSON-LD and meta/OG tags per page.
5. Optional nav/footer link to Guides, plus links from /services/revenue-systems.html and /services/websites.html.
6. Check CSP: images must be self-hosted or https (img-src allows https:). No third-party scripts.
7. Four-agent swarm review + security sign-off. Draft PR only; no merge/deploy without Evan's explicit go.
Note: Cursor cloud usage is exhausted, so this would run as a Codex task.
