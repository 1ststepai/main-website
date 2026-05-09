function md(value, fallback = "Not provided") {
  const text = String(value || "").trim();
  return text || fallback;
}

function list(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function answerLines(answers) {
  const entries = Object.entries(answers || {});
  if (!entries.length) {
    return "- No detailed answers were provided.";
  }

  return entries
    .map(([key, value]) => `- ${key.replace(/_/g, " ")}: ${md(value)}`)
    .join("\n");
}

function suggestedFirstMove(lead) {
  if (lead.lead_quality === "high") {
    return "Scope a focused MVP around the single core workflow that proves demand.";
  }
  if (lead.lead_quality === "medium") {
    return "Validate the buyer, offer, and first workflow before committing to a larger build.";
  }
  return "Avoid a full build. Start with validation, a landing page, manual delivery, or a clickable prototype.";
}

function file(path, content) {
  return {
    path,
    content: `${content.trim()}\n`
  };
}

export function generateMarkdownPack(lead) {
  const root = `generated-projects/${lead.project_slug}`;
  const summary = [
    `Lead ID: ${lead.lead_id}`,
    `Project Slug: ${lead.project_slug}`,
    `Lead Quality: ${lead.lead_quality}`,
    `Score: ${lead.score}/100`,
    `Category: ${lead.category}`,
    `Idea Type: ${lead.idea_type}`,
    `Audience: ${md(lead.audience)}`,
    `Budget: ${lead.budget}`,
    `Launch Timeline: ${md(lead.launch_timeline)}`,
    `Recommended Path: ${md(lead.recommended_path)}`
  ];

  return [
    file(`${root}/README.md`, `
# ${md(lead.name)} MVP Context Pack

This pack was generated from the App Idea Viability Checker intake.

${summary.map((line) => `- ${line}`).join("\n")}

## How To Use This Pack

Use \`PROJECT_BRIEF.md\` to understand the opportunity, \`MVP_SCOPE.md\` to keep the first version focused, and \`CODEX_PROMPT.md\` or \`CLAUDE_PROMPT.md\` to start implementation planning.
`),
    file(`${root}/PROJECT_BRIEF.md`, `
# Project Brief

## Founder / Lead

- Name: ${md(lead.name)}
- Email: ${md(lead.email)}
- Phone: ${md(lead.phone, "Optional / not provided")}
- Source: ${md(lead.source)}
- Submitted: ${md(lead.server_created_at)}

## Idea Snapshot

- Idea type: ${md(lead.idea_type)}
- Audience: ${md(lead.audience)}
- Score: ${lead.score}/100
- Category: ${md(lead.category)}
- Lead quality: ${md(lead.lead_quality)}
- Budget: ${md(lead.budget)}
- Launch timeline: ${md(lead.launch_timeline)}

## Intake Answers

${answerLines(lead.answers)}
`),
    file(`${root}/MVP_SCOPE.md`, `
# MVP Scope

## Recommended First Version

${md(lead.recommended_path)}

## Scope Rule

Build the smallest version that proves demand. Do not expand into a full platform until the core workflow has evidence from real users.

## Include First

${list([
  "A clear landing or onboarding path for the target audience.",
  "The one core workflow tied to the buyer's main problem.",
  "Lead capture, usage tracking, or another proof mechanism.",
  "Admin-friendly copy and content that can be edited without engineering when possible."
])}

## Exclude From First Version

${list([
  "Complex role systems unless required for the core workflow.",
  "Marketplace mechanics before supply and demand are validated.",
  "Advanced AI features before the manual workflow is understood.",
  "Large settings areas, dashboards, or reporting unless essential."
])}
`),
    file(`${root}/USER_STORIES.md`, `
# User Stories

## Primary User

As a ${md(lead.audience).toLowerCase()}, I want a focused solution for the problem described in the intake so that I can get a useful outcome without navigating a bloated product.

## Founder

As the founder, I want the first release to prove demand before I overspend on development.

## Admin / Operator

As the operator, I want to review leads, activity, or submissions so I can understand whether the MVP is working.

## Acceptance Notes

${list([
  "The product should make the core action obvious.",
  "The first version should capture enough signal to decide what to build next.",
  "The MVP should avoid features that do not directly support validation, revenue, or delivery."
])}
`),
    file(`${root}/TECHNICAL_PLAN.md`, `
# Technical Plan

## Recommended Architecture

Start with a simple web-first build unless the validated use case truly requires native mobile.

## Suggested Stack

${list([
  "Frontend: lightweight React/Next.js or static HTML depending on complexity.",
  "Backend: serverless routes for intake, auth, and workflow actions.",
  "Data: low-cost managed database or file/KV storage during validation.",
  "Integrations: add only the systems needed for the first proof point."
])}

## Server-Side Scoring Note

The submitted client-side score is preserved for now. Add server-side scoring later before using the score for automated qualification or paid workflow decisions.
`),
    file(`${root}/BUILD_PHASES.md`, `
# Build Phases

## Phase 1: Validation

${suggestedFirstMove(lead)}

## Phase 2: MVP

Build the focused workflow, capture proof, and tighten the offer.

## Phase 3: Polish

Improve UX, performance, onboarding, and reporting after the core signal is proven.
`),
    file(`${root}/RISKS_AND_ASSUMPTIONS.md`, `
# Risks And Assumptions

## Current Risk Level

Lead quality is classified as **${lead.lead_quality}** based on score and budget.

## Key Assumptions

${list([
  "The client-side score reflects honest intake answers.",
  "The selected audience has a reachable buyer or user segment.",
  "The stated budget is available for the recommended first path.",
  "The first version can be scoped around one primary workflow."
])}

## Risks To Resolve

${list([
  "Unclear buyer urgency.",
  "Weak distribution or no existing audience.",
  "Overbuilding before demand is proven.",
  "Pricing uncertainty."
])}
`),
    file(`${root}/CLAUDE_PROMPT.md`, `
# Claude Prompt

You are helping scope an MVP for this prospect. Use the project brief and MVP scope files in this pack.

Goals:
- Identify the smallest useful first version.
- Clarify the buyer, problem, workflow, and validation plan.
- Avoid adding features that do not support demand proof.
- Produce a practical build brief and next-step questions.

Context:
${summary.map((line) => `- ${line}`).join("\n")}
`),
    file(`${root}/CODEX_PROMPT.md`, `
# Codex Prompt

You are implementing or planning the first build for this MVP.

Use this context pack as the source of truth. Keep the build lean, practical, and focused on the first validated workflow.

Do:
- Read PROJECT_BRIEF.md and MVP_SCOPE.md first.
- Implement only the core workflow.
- Add tests or QA notes for the highest-risk behavior.
- Keep integrations minimal until demand is proven.

Do not:
- Build a dashboard unless the workflow requires it.
- Add paid APIs by default.
- Add GitHub automation by default.
- Expand scope beyond the recommended first path.
`),
    file(`${root}/skills/brand-voice.md`, `
# Brand Voice

Tone: premium, sharp, practical, founder-friendly, no fluff.

Use direct language. Explain tradeoffs clearly. Avoid generic agency language.
`),
    file(`${root}/skills/mvp-scope-control.md`, `
# MVP Scope Control

Every feature must answer one question: does this help prove demand, revenue, delivery, or the core workflow?

If not, defer it.
`),
    file(`${root}/skills/token-usage-rules.md`, `
# Token Usage Rules

Prefer concise summaries, small diffs, and scoped implementation plans. Load only the files needed for the current task.
`),
    file(`${root}/skills/discovery-to-build.md`, `
# Discovery To Build

Turn intake answers into a build plan by identifying:
- Buyer
- Problem
- First workflow
- Proof signal
- Budget fit
- Launch path
`),
    file(`${root}/tasks/phase-1-validation.md`, `
# Phase 1 Validation Task

Validate the offer, audience, and first workflow before expanding the build.

Deliverables:
${list([
  "One-page validation plan.",
  "Landing page or prototype recommendation.",
  "Top five discovery questions.",
  "Decision criteria for moving into MVP build."
])}
`),
    file(`${root}/tasks/phase-2-mvp.md`, `
# Phase 2 MVP Task

Build the narrowest usable version of the core workflow.

Deliverables:
${list([
  "MVP feature list.",
  "Data model sketch.",
  "Core screens or endpoints.",
  "QA checklist."
])}
`),
    file(`${root}/tasks/phase-3-polish.md`, `
# Phase 3 Polish Task

Polish only after the first workflow is validated.

Deliverables:
${list([
  "UX improvements.",
  "Performance pass.",
  "Analytics review.",
  "Launch-readiness checklist."
])}
`)
  ];
}
