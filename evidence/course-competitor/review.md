# Local UI and platform review

Owner: Codex root UI/frontend; separate platform and security agents reviewed stubs. Baseline b32cbac, branch course/competitor-patterns-local. No release requested.

## UI acceptance
- Required order implemented: hero, fit/not-for, fictional Oak Street lesson, four workshop artifacts, live practice loop, instructor, hidden proof placeholder, seven-question beginner FAQ, repeated waitlist CTA.
- V4 teaching, FAQ, price and instructor wording retained. Added fit label, practice-loop labels, consent text and hidden proof text are DRAFT for Evan review in markup comments; consent marker is visible.
- No video/work links/results were supplied or newly verified. Instructor retains the supplied V4 work description; no links or proof claims added. Proof stays hidden.
- Actual desktop/mobile hero, practice and signup PNGs inspected against supplied V4 boards. Palette, fonts, intact logo, cream lesson panels and lime CTA retained. Full approved copy is longer than abbreviated boards; workshop artifacts now have explicit visual emphasis and live loop is its own section. CSS steps remain the existing approximation of the V4 illustration.
- Responsive checks include 320/390/768/1280/1440. Browser outcomes are in build-tests.md. Full accessibility audit not performed; semantic headings, native required consent/email controls, focus styling and reduced-motion rule retained.

## Platform review (independent read-only agent)
- No fetch/XHR/API calls in course scripts. Library download uses a local Blob; copy uses clipboard only on user action.
- Library optional course consent remains unchecked. Waitlist now requires separate unchecked consent and passes actual checked state to adapter.
- Adapter blocks public hosts, stores only anonymous simulation kind/consent, never stores email, and reports storage failures honestly.
- Course/library noindex and form-action none retained. Library markup and resource content were not edited.
- No production/deployment config, live endpoint, email, public indexing, credentials or app authority changes.
