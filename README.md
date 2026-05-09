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

Run Vercel functions locally:

```bash
npx vercel dev
```

The Vite dev server alone does not run `/api/app-idea-checker`.

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
