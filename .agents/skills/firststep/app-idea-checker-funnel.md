# App Idea Checker Funnel

## When To Use

Use this skill when updating the App Idea Viability Checker, MVP Readiness Score, lead capture, Resend notifications, report preview, booking CTA, or `/api/app-idea-checker` integration.

## Project-Specific Rules

The App Idea Checker is the primary 1stStep.ai lead magnet.

Preserve:

- `/app-idea-viability-checker.html`
- `POST /api/app-idea-checker`
- Resend admin notification
- `localStorage` key `appIdeaCheckerLastResponse`
- deterministic context pack generation
- GHL forwarding disabled unless explicitly enabled
- `repo_creation_status: locked_until_signed_and_paid`
- no paid AI calls by default

## Copy/UX Rules

Optimize for:

- low-friction idea entry
- instant first-pass score
- optional 4-question clarification
- report preview before contact capture
- clear booking CTA after save
- no public-facing "lazy" wording

Preferred public wording:

- `Check My Idea`
- `Answer 4 Quick Questions`
- `Review My Idea`
- `Skip the questions - just review my idea.`
- `Save My MVP Readiness Report`
- `Book a Free MVP Strategy Call`

## Safety Constraints

- Do not remove the booking CTA.
- Do not claim an email was sent to the user unless user-facing email delivery exists.
- Do not fail the main checker submission if Resend/GHL forwarding fails.
- Do not enable repo creation.
- Do not add paid AI APIs.
- Keep server-side validation and context-pack generation intact.

## Acceptance Checklist

- Idea textarea works.
- Snapshot appears before contact capture.
- 4-question clarifier path works.
- Idea-only review path works.
- Contact form prevents duplicate submit.
- Success response is stored as `appIdeaCheckerLastResponse`.
- API response keeps `generated_files` length 16.
- `notifications.admin_email.status` is present.
