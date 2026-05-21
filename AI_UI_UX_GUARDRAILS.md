# AI UI/UX Guardrails

This repository may use UI/UX Pro Max as a design-assistance skill for Claude, Codex, Cursor, or other AI coding assistants.

## Rules

1. Do not redesign the entire product unless explicitly requested.
2. Do not change brand colors, logo, typography direction, routes, CTA destinations, or layout structure unless the task explicitly allows it.
3. Prefer small, reviewable UI improvements over broad rewrites.
4. Always inspect the existing design system before creating new components.
5. Preserve accessibility: semantic HTML, keyboard navigation, contrast, labels, landmarks, and responsive behavior.
6. Do not introduce paid APIs, tracking scripts, third-party embeds, or new dependencies without approval.
7. Do not modify legal, pricing, payment, auth, privacy, or data-handling flows unless requested.
8. For Universal Relocations or any workflow involving customer/employee/shipment data, treat all data as sensitive and minimize exposure.
9. After any UI work, run lint/build/typecheck when available.
10. Always provide a concise diff summary and list exactly which files changed.

## Project-specific design authority

Existing project design overrides generic UI/UX Pro Max suggestions.

For Real Rank AI:
- Preserve premium dark navy/lime/gold real-estate SaaS direction.
- Preserve dashboard shell, report cards, snapshot flow, AI visibility report, Google Maps audit, competitor tracking, and 30-day growth plan concepts.
- Do not use ranking-guarantee language.

For 1stStep.ai:
- Preserve simple app-builder/resume-builder positioning.
- Avoid cluttered AI-looking layouts.
- Prioritize conversion clarity, proof, examples, and lead capture.

For Trading Tools / Swing Trade Pros:
- Preserve trading-dashboard clarity.
- Prioritize fast scanning, clean signal hierarchy, risk visibility, responsive charts/tables, and low-distraction layouts.
- Do not add financial performance guarantees or exaggerated claims.

For Steven Bunker / Real Rank AI client work:
- Preserve client-specific brand direction.
- Prioritize local SEO, AI visibility, lead capture, credibility, and conversion.
- Do not add ranking guarantees.
