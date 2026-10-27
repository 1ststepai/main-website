const MAX_PROJECTS = 40;
const MAX_TASKS = 40;
const MAX_LINKS = 12;
const MAX_TOOLS = 20;
const MAX_CANDIDATES = 8;

export const PROOF_LEVELS = ["none", "claimed", "tested", "deployed", "production_verified"];
export const TASK_STATUSES = ["open", "blocked", "done"];
export const PROOF_HONESTY = "Recorded status only. Studio did not re-run tests or confirm that a deployment is live.";

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk_(?:live|test)_[A-Za-z0-9]{8,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bBRIDGE_[A-Z0-9_]*TOKEN\s*=\s*\S+/gi,
  /\bBearer\s+[A-Za-z0-9\-._~+/]{20,}={0,2}\b/gi,
  /\b(?:api[_-]?key|secret|token)\s*[:=]\s*['"]?[A-Za-z0-9\-._]{16,}['"]?/gi,
];

function validationError(message) {
  const error = new Error(message);
  error.code = "invalid_handoff";
  error.statusCode = 400;
  return error;
}

function text(value, maximum, fallback = "") {
  const normalized = String(value ?? fallback).replace(/\u0000/g, "").trim();
  if (normalized.length > maximum) throw validationError(`Text exceeds ${maximum} characters`);
  if (findsSecret(normalized)) throw validationError("Remove credentials before saving a handoff.");
  return normalized;
}

function optionalText(value, maximum) {
  const normalized = text(value, maximum);
  return normalized || "";
}

export function findsSecret(value) {
  const haystack = String(value || "");
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(haystack);
  });
}

export function redactSecrets(value) {
  let output = String(value ?? "");
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    output = output.replace(pattern, "[redacted]");
  }
  return output;
}

export function containsConfiguredSecret(value, env = process.env) {
  const haystack = typeof value === "string" ? value : JSON.stringify(value);
  return Object.entries(env).some(([key, raw]) => {
    if (!/TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE/i.test(key)) return false;
    const secret = String(raw || "");
    return secret.length >= 16 && haystack.includes(secret);
  });
}

function identifier(value) {
  const normalized = text(value, 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) throw validationError("Invalid record identifier");
  return normalized;
}

function cents(value, { allowNull = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (allowNull) return null;
    throw validationError("Amount is required");
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100_000_000) {
    throw validationError("Amount must be a whole number of cents");
  }
  return number;
}

function sha(value) {
  const normalized = optionalText(value, 40).toLowerCase();
  if (!normalized) return "";
  if (!/^[a-f0-9]{7,40}$/.test(normalized)) throw validationError("Commit SHA must be 7 to 40 hexadecimal characters");
  return normalized;
}

export function safeHttpUrl(value) {
  const raw = optionalText(value, 500);
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw validationError("Link must be an http or https URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw validationError("Link must be an http or https URL without embedded credentials");
  }
  return parsed.toString();
}

function repositoryUrl(value) {
  const url = safeHttpUrl(value);
  if (url && !url.startsWith("https:")) throw validationError("Repository URL must use https");
  return url;
}

function proof(value = {}) {
  const level = PROOF_LEVELS.includes(value.level) ? value.level : "none";
  const evidence = Array.isArray(value.evidence) ? value.evidence.slice(0, MAX_LINKS).map(normalizeLink) : [];
  const verificationNotes = optionalText(value.verification_notes, 2000);
  const httpsEvidence = evidence.some((item) => item.url.startsWith("https:"));
  if (level === "tested" && !verificationNotes && !sha(value.tested_sha)) {
    throw validationError("Tested proof needs a tested commit SHA or verification notes");
  }
  if (level === "deployed" && evidence.length === 0) {
    throw validationError("Deployed proof needs an evidence link");
  }
  if (level === "production_verified" && (!httpsEvidence || !verificationNotes)) {
    throw validationError("Production-verified proof needs an https evidence link and verification notes");
  }
  return {
    level,
    evidence,
    verification_notes: verificationNotes,
    independently_verified: false,
    honesty: PROOF_HONESTY,
  };
}

function normalizeLink(link) {
  return {
    label: optionalText(link?.label, 120) || "Link",
    url: safeHttpUrl(link?.url || link),
  };
}

function normalizeTool(tool) {
  const kind = ["owned", "adopted", "custom"].includes(tool?.kind) ? tool.kind : "owned";
  return {
    id: identifier(tool?.id),
    name: text(tool?.name, 120),
    kind,
  };
}

export function createEmptyHandoffBoard() {
  return { revision: 0, updated_at: null, projects: [] };
}

function uniqueIds(records, label) {
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) throw validationError(`Duplicate ${label} identifier`);
    ids.add(record.id);
  }
}

function normalizeTask(task, project, evaluateToolChoice) {
  const links = Array.isArray(task.links) ? task.links.slice(0, MAX_LINKS).map((link) => {
    const normalized = normalizeLink(link);
    if (!normalized.url) throw validationError("Task link URL is required");
    return normalized;
  }) : [];
  const proofInput = { ...(task.proof || {}), tested_sha: task.tested_sha };
  const normalizedProof = proof(proofInput);
  const status = TASK_STATUSES.includes(task.status) ? task.status : "open";
  return {
    id: identifier(task.id),
    title: text(task.title, 160),
    status,
    goal: optionalText(task.goal, 2000),
    current_state: optionalText(task.current_state, 4000),
    decisions: optionalText(task.decisions, 4000),
    blockers: optionalText(task.blockers, 2000),
    next_action: text(task.next_action, 500),
    links,
    source_sha: sha(task.source_sha),
    tested_sha: sha(task.tested_sha),
    proof: normalizedProof,
    tool_decision: normalizeToolDecision(task, project, evaluateToolChoice),
  };
}

function normalizeCandidate(candidate) {
  const kind = ["reuse", "adopt", "build"].includes(candidate?.kind) ? candidate.kind : "adopt";
  const setup = ["minutes", "hours", "days", "unknown"].includes(candidate?.setup) ? candidate.setup : "unknown";
  const maintenance = ["low", "medium", "high", "unknown"].includes(candidate?.maintenance) ? candidate.maintenance : "unknown";
  return {
    id: identifier(candidate?.id),
    name: text(candidate?.name, 120),
    kind,
    already_owned: candidate?.already_owned === true,
    fits: candidate?.fits === true,
    setup,
    recurring_cents: cents(candidate?.recurring_cents, { allowNull: true }),
    setup_cents: cents(candidate?.setup_cents, { allowNull: true }),
    maintenance,
    security: optionalText(candidate?.security, 500),
    evidence: optionalText(candidate?.evidence, 500),
  };
}

function normalizeToolDecision(task, project, evaluateToolChoice) {
  const source = task.tool_request || task.tool_decision;
  if (!source) return null;
  const candidates = Array.isArray(source.candidates) ? source.candidates.slice(0, MAX_CANDIDATES).map(normalizeCandidate) : [];
  const need = text(source.need, 500);
  const evaluation = evaluateToolChoice({
    need,
    inventory: project.tools,
    candidates,
    budgetLimitCents: project.budget_limit_cents,
    budgetSpentCents: project.budget_spent_cents,
    ownerApproved: source.owner_approved === true,
    ownerApprovedOverBudget: source.owner_approved_over_budget === true,
  });
  return {
    need,
    candidates,
    owner_approved: source.owner_approved === true,
    owner_approved_over_budget: source.owner_approved_over_budget === true,
    evaluation,
  };
}

function normalizeProject(project, evaluateToolChoice) {
  const tools = Array.isArray(project.tools) ? project.tools.slice(0, MAX_TOOLS).map(normalizeTool) : [];
  const normalized = {
    id: identifier(project.id),
    name: text(project.name, 160),
    business: optionalText(project.business, 160),
    brand_notes: optionalText(project.brand_notes, 2000),
    repository_url: repositoryUrl(project.repository_url),
    decision_log: optionalText(project.decision_log, 4000),
    budget_limit_cents: cents(project.budget_limit_cents, { allowNull: true }),
    budget_spent_cents: cents(project.budget_spent_cents ?? 0),
    tools,
    tasks: [],
  };
  const tasks = Array.isArray(project.tasks) ? project.tasks.slice(0, MAX_TASKS) : [];
  normalized.tasks = tasks.map((task) => normalizeTask(task, normalized, evaluateToolChoice));
  uniqueIds(normalized.tasks, "task");
  uniqueIds(tools, "tool");
  return normalized;
}

export function normalizeHandoffBoard(input, evaluateToolChoice, env) {
  const secretEnv = env || (typeof process === "undefined" ? {} : process.env || {});
  if (!input || typeof input !== "object") throw validationError("Handoff board is required");
  if (!Array.isArray(input.projects) || input.projects.length > MAX_PROJECTS) {
    throw validationError("Invalid projects collection");
  }
  if (typeof evaluateToolChoice !== "function") throw validationError("Tool choice is unavailable");
  const projects = input.projects.map((project) => normalizeProject(project, evaluateToolChoice));
  uniqueIds(projects, "project");
  const board = {
    revision: Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    updated_at: input.updated_at ? text(input.updated_at, 40) : null,
    projects,
  };
  if (containsConfiguredSecret(board, secretEnv)) {
    throw validationError("Remove credentials before saving a handoff.");
  }
  return board;
}

function money(centsValue) {
  if (centsValue === null || centsValue === undefined) return "unknown";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(centsValue / 100);
}

function proofLine(level) {
  if (level === "none") return "No proof recorded.";
  if (level === "claimed") return "Recorded as claimed. This is not a test result.";
  if (level === "tested") return "Recorded as tested. Studio did not re-run these checks.";
  if (level === "deployed") return "Recorded as deployed. Studio did not confirm the deployment is live.";
  return "Recorded as production-verified. Studio did not confirm the live deployment.";
}

export function renderHandoffMarkdown(project, task) {
  if (!project || !task) throw validationError("Project and task are required");
  const lines = [
    `# Handoff: ${project.name} / ${task.title}`,
    "",
    project.business ? `Business: ${project.business}` : "Business: not recorded",
    project.brand_notes ? `Brand notes: ${project.brand_notes}` : "Brand notes: none recorded for this project",
    project.repository_url ? `Repository: ${project.repository_url}` : "Repository: not recorded",
    "",
    "## Goal",
    task.goal || "Not recorded",
    "",
    "## Current state",
    task.current_state || "Not recorded",
    "",
    "## Decisions",
    task.decisions || project.decision_log || "None recorded",
    "",
    "## Links",
  ];
  if (task.links.length === 0) lines.push("None recorded");
  else task.links.forEach((link) => lines.push(`- ${link.label}: ${link.url}`));
  lines.push(
    "",
    "## Commits",
    `- Source SHA: ${task.source_sha || "not recorded"}`,
    `- Tested SHA: ${task.tested_sha || "not recorded"}`,
  );
  if (task.source_sha && task.tested_sha && task.source_sha !== task.tested_sha) {
    lines.push("- The tested SHA differs from the source SHA.");
  }
  lines.push(
    "",
    "## Blockers",
    task.blockers || "None recorded",
    "",
    "## Next action",
    task.next_action,
    "",
    "## Proof of done",
    proofLine(task.proof.level),
    PROOF_HONESTY,
  );
  if (task.proof.evidence.length === 0) lines.push("Evidence links: none recorded");
  else task.proof.evidence.forEach((link) => lines.push(`- ${link.label}: ${link.url}`));
  if (task.proof.verification_notes) lines.push("", "Verification notes:", task.proof.verification_notes);
  const budgetLimit = project.budget_limit_cents;
  lines.push(
    "",
    "## Budget",
    budgetLimit === null ? "Budget: not set" : `Budget: ${money(budgetLimit)}`,
    `Recorded spend: ${money(project.budget_spent_cents)} (entered for this project; no usage meter is connected)`,
  );
  if (task.tool_decision) {
    const evaluation = task.tool_decision.evaluation;
    lines.push(
      "",
      "## Tool choice",
      `Need: ${task.tool_decision.need}`,
      `Choice: ${evaluation.option_name || "none"} (${evaluation.choice})`,
      `Approval: ${evaluation.approval}`,
      `Estimated cost: ${evaluation.estimated_cost_label === "unknown" ? "unknown" : evaluation.estimated_cost_label === "included" ? "included with a tool already on this project" : money(evaluation.estimated_cost_cents)} (${evaluation.estimated_cost_label})`,
      `Savings: ${evaluation.savings_label === "estimate" ? `${money(evaluation.savings_cents)} estimate` : evaluation.savings_label}`,
      `Actual usage: ${evaluation.actual_usage.note}`,
      `Tradeoff: ${evaluation.tradeoff}`,
    );
    if (evaluation.approval === "required") {
      lines.push("Do not start a new charge or exceed the budget until the owner approves it.");
    }
  }
  lines.push("", "This handoff is for this project only. It does not authorize purchases, deploys, or credential changes.");
  return lines.join("\n");
}
