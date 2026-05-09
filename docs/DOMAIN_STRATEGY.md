# 1stStep.ai Domain Strategy

## Purpose

`1ststep.ai` is the parent business and services website for app builds, MVP builds, websites, SaaS builds, AI automations, build strategy, and the App Idea Viability Checker / MVP Readiness Score.

The AI Resume Builder is a separate product. It should not replace or reposition the parent 1stStep.ai website.

## Domain Map

| Hostname | Purpose | Platform |
| --- | --- | --- |
| `1ststep.ai` | Main 1stStep.ai business/services website for apps, websites, MVPs, SaaS, AI automations, and build strategy | Vercel `main-website` project |
| `www.1ststep.ai` | WWW alias for the main business/services website | Vercel `main-website` project |
| `book.1ststep.ai` | Optional booking/calendar hostname if a branded calendar URL is needed later | GoHighLevel |
| `go.1ststep.ai` | Optional funnels/landing pages hostname if needed later | GoHighLevel |
| `resume.1ststep.ai` | AI Resume Builder landing page | Separate resume product project |
| `app.1ststep.ai` | AI Resume Builder web app | Separate resume app project |

## Vercel Role

Vercel should host the main website at:

- `1ststep.ai`
- `www.1ststep.ai`

The current Vercel project should remain the source for the main website repo:

- GitHub repo: `https://github.com/1ststepai/main-website`
- Current deployment: `https://main-website-repo.vercel.app`

When ready for production DNS, add `1ststep.ai` and `www.1ststep.ai` to the Vercel main website project. Do not change DNS from code.

## GoHighLevel Role

GoHighLevel should be used for CRM, calendar, workflows, and optional funnels only.

Recommended GHL hostnames:

- `book.1ststep.ai` for booking/calendar, if configured later.
- `go.1ststep.ai` for funnels/landing pages, if needed later.

Do not point GHL and Vercel at the same hostname.

## Resume Product Separation

The resume product remains separate:

- `resume.1ststep.ai` is the AI Resume Builder landing page.
- `app.1ststep.ai` is the AI Resume Builder app.

Do not use `resume.1ststep.ai` or `app.1ststep.ai` as the parent business website. Do not reposition the main `1ststep.ai` site as a resume builder.

## Safety Rules

- Do not point multiple platforms at the same hostname.
- Do not use `app.1ststep.ai` as the main website URL.
- Do not use `resume.1ststep.ai` as the parent website URL.
- Keep the App Idea Checker backend forwarding disabled until the GHL inbound webhook is ready.
- Keep repo creation locked until discovery is completed, proposal is accepted, deposit is paid, and Phase 1 Build has started.
