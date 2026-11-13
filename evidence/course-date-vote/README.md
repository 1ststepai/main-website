# Course start-date vote — local review evidence

Status: locally verified on `course/date-vote-included`, based on `135d7815228eec81a50d6656b965aabd99e1446a`. Evan's screenshot review is pending. Nothing published.

## Verification

- `npm test`: **247 passed, 0 failed, 0 skipped**. Includes existing consent, email, kind, CORS, size, idempotency, failure-leak and seven verbatim policy-answer checks. New tests cover every date, multiple/none/empty choices, deduplication, invalid values, library exclusion, mocked tag delivery, date-sensitive idempotency and anonymous local storage.
- `npm run build`: **passed**, repository-local Vite 6.4.5. Existing shared bundle-size warning only. Dependencies were already installed. No lint script is defined.
- `git diff --check`: **passed**.
- Built site served temporarily on `127.0.0.1:4197`; existing port 4186 was left untouched. Preview stopped after verification.
- Browser checks: **passed** at 1440, 1280, 768, 390 and 320px. No horizontal overflow; new chip/reminder targets are at least 44px. See `browser-checks.json`.
- Real checkbox keyboard Space selection and visible focus, multiple Sunday selections, mutually exclusive none/Sunday UI, selected and empty local submissions, exact anonymous stored record, and absence of library date controls: **passed**. No browser page errors or course API calls. External requests were blocked.
- New text/UI contrast: ink `#0B0D0E` on paper `#F3F4F0` exceeds 17:1; blue `#0059CC` on white exceeds 6:1; white on selected/button blue `#006EEC` exceeds 4.5:1; blue borders/focus on paper exceed 3:1. Existing unrelated dark-page muted chrome remains as baseline; this is not a whole-page accessibility certification.
- Screenshots visually reviewed: readable disclosure and date reminders, wrapping chips, selected state and keyboard focus. Tall section captures preserve complete contents. Screenshot-only style hides the offscreen, unfocused skip link to prevent a Chromium tall-element capture artifact; the actual page and keyboard skip link are unchanged.

## Screenshots

- `hero-1440.png`: desktop hero, disclosure and linked date reminders.
- `hero-390.png`: mobile hero, disclosure and linked date reminders.
- `waitlist-1440-selected.png`: desktop waitlist, date chips above the Join button, multiple selections and keyboard focus.
- `waitlist-390-selected.png`: mobile waitlist, date chips above the Join button, multiple selections and keyboard focus.

`verify.mjs` reproduces browser checks against the built preview using the existing cached Playwright install and known headless Chromium. It blocks external traffic and course API calls. No dependency changes.

## Limits

No push, upstream configuration, PR, merge, deployment, production check, real GoHighLevel contact, payment or credential access. All GHL test fetch calls were mocked. Library HTML and approved policy JSON are unchanged. Hosted GHL delivery, analytics/attribution, production headers and live behavior remain unverified. Screenshot approval and separate release authorization are required before publication.
