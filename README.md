# 1stStep.ai Main Website

This repository is the source of truth for the main 1stStep.ai website.

Production is hosted on Vercel:

- Main site: `https://main-website-repo.vercel.app`
- App Idea Checker: `https://main-website-repo.vercel.app/app-idea-viability-checker.html`
- Intake endpoint: `https://main-website-repo.vercel.app/api/app-idea-checker`

## Positioning

`1ststep.ai` is the parent business/services website for:

- App builds
- MVP builds
- Websites
- SaaS builds
- AI automations
- Build strategy
- App Idea Viability Checker / MVP Readiness Score

The resume product is separate:

- `resume.1ststep.ai` = AI Resume Builder landing page
- `app.1ststep.ai` = AI Resume Builder web app

Do not reposition the main 1stStep.ai website as a resume-builder site.

## Domain Mapping

Expected production domain setup:

- `https://1ststep.ai` -> Vercel main website
- `https://www.1ststep.ai` -> Vercel main website
- `https://1ststep.ai/app-idea-viability-checker.html` -> App Idea Viability Checker

Do not point the main `1ststep.ai` hostname at GoHighLevel.

## GoHighLevel Role

GoHighLevel is used only for:

- CRM
- Booking calendar
- Lead capture workflows
- Pipeline automation
- Follow-up email/SMS automation when intentionally configured

The booking CTA should continue to use:

```text
https://api.leadconnectorhq.com/widget/booking/Rb4aqLM1NdU5kvZcqNmj
```

Optional GHL subdomains may be used later:

- `book.1ststep.ai` for a branded calendar URL
- `go.1ststep.ai` for GHL funnels/landing pages

Do not point multiple platforms at the same hostname.

## App Idea Checker

The checker must remain accessible at:

```text
/app-idea-viability-checker.html
```

The frontend posts to the same-domain API endpoint:

```text
/api/app-idea-checker
```

GHL forwarding remains disabled unless:

```text
APP_IDEA_FORWARDING_ENABLED=true
```

Repo creation remains locked until proposal acceptance and deposit/payment gates are met.

## Local Development

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Run the server and API tests:

```bash
npm test
```

Run the complete local verification set:

```bash
npm run check
npm audit --audit-level=high
```

Run Vercel functions locally:

```bash
npx vercel dev
```

The Vite dev server alone does not run `/api/app-idea-checker`.

### Private 1stStep Studio

The owner workspace is available at `/admin/`. It is intentionally absent from
public navigation and requires the server-backed admin session before loading
client records.

For a non-persistent local design preview:

```text
http://127.0.0.1:5173/admin/?preview=1
```

The preview flag is compiled out of production behavior. Production requires:

- `FIRSTSTEP_ADMIN_PASSWORD` (at least 12 characters)
- `FIRSTSTEP_ADMIN_SESSION_SECRET` (at least 32 random characters)
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Quotes can be previewed and printed or saved as PDF. Agreement structures are
editable drafting starters and should be reviewed by qualified counsel before
client use.

Saved quotes can also be sent through the authenticated backend using the
existing `RESEND_API_KEY`. The sender and Reply-To are fixed to
`Evan at 1stStep.ai <evan@1ststep.ai>`; recipients come only from the saved
client attached to the quote. Production delivery requires `1ststep.ai` to be
verified in Resend. Resend idempotency keys prevent duplicate delivery during
safe retries.

## Deployment

Deployments should come from this GitHub-backed Vercel project.

Recommended Vercel settings:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

Do not commit:

- `.env`
- `.vercel/`
- `node_modules/`
- `dist/`

## Intake Safety

- The checker accepts JSON only, validates a bounded allowlist, rate-limits requests, and restricts browser origins.
- The browser keeps only a minimized result summary under `appIdeaCheckerLastResponse`; contact details and idea text are not stored in browser storage.
- A `200` response means at least one delivery path succeeded: KV persistence, Resend notification, or an explicitly enabled webhook.
- Without a successful delivery path, the endpoint returns `503` and the UI tells the visitor to retry or book directly.
- `repo_creation_status` remains `locked_until_signed_and_paid`.

See `docs/APP_IDEA_CHECKER_OPERATIONS.md` before changing production environment values.
