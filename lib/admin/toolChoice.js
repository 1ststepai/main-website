const ACTUAL_USAGE = {
  state: "unavailable",
  note: "No usage meter is connected. Recorded spend is what was entered for this project, not a provider invoice.",
};

function money(cents) {
  if (cents === null || cents === undefined) return "unknown";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function ownedName(inventory, candidate) {
  return (inventory || []).some((tool) => String(tool.name || "").trim().toLowerCase() === candidate.name.trim().toLowerCase());
}

function newChargeCents(candidate) {
  if (candidate.already_owned) return 0;
  if (candidate.recurring_cents === null || candidate.setup_cents === null) return null;
  return candidate.recurring_cents + candidate.setup_cents;
}

function rank(candidate) {
  if (candidate.kind === "reuse" || candidate.already_owned) return 0;
  if (candidate.kind === "adopt") return 1;
  return 2;
}

export function evaluateToolChoice({
  need,
  inventory = [],
  candidates = [],
  budgetLimitCents = null,
  budgetSpentCents = 0,
  ownerApproved = false,
  ownerApprovedOverBudget = false,
} = {}) {
  const prepared = candidates.map((candidate) => {
    const alreadyOwned = candidate.already_owned === true || ownedName(inventory, candidate);
    return {
      ...candidate,
      already_owned: alreadyOwned,
      kind: alreadyOwned && candidate.kind !== "build" ? "reuse" : candidate.kind,
    };
  });
  const fitting = prepared.filter((candidate) => candidate.fits === true);
  if (fitting.length === 0) {
    return {
      choice: "none",
      option_id: null,
      option_name: null,
      approval: "not_required",
      reason: prepared.length === 0
        ? "No options were provided, so nothing was selected or built."
        : "None of the options fit this task, so nothing was selected or built.",
      estimated_cost_cents: null,
      estimated_cost_label: "unknown",
      estimated_setup: "unknown",
      actual_usage: ACTUAL_USAGE,
      savings_cents: null,
      savings_label: "not_applicable",
      within_budget: null,
      tradeoff: "No fitting option. Building a replacement was not assumed.",
    };
  }

  const ordered = [...fitting].sort((left, right) => {
    const rankGap = rank(left) - rank(right);
    if (rankGap !== 0) return rankGap;
    const leftCost = newChargeCents(left);
    const rightCost = newChargeCents(right);
    if (leftCost === null && rightCost !== null) return 1;
    if (leftCost !== null && rightCost === null) return -1;
    if (leftCost !== null && rightCost !== null && leftCost !== rightCost) return leftCost - rightCost;
    return left.name.localeCompare(right.name);
  });
  const chosen = ordered[0];
  const charge = newChargeCents(chosen);
  const remaining = budgetLimitCents === null ? null : budgetLimitCents - budgetSpentCents;
  const overBudget = charge !== null && charge > 0 && remaining !== null && charge > remaining;
  const unknownCharge = charge === null;
  let approval = "not_required";
  if (unknownCharge) approval = "required";
  else if (charge > 0 && overBudget) approval = ownerApprovedOverBudget ? "approved" : "required";
  else if (charge > 0) approval = ownerApproved ? "approved" : "required";

  const alternative = ordered.find((candidate) => candidate.id !== chosen.id && newChargeCents(candidate) !== null && newChargeCents(candidate) > (charge || 0));
  let savingsCents = null;
  let savingsLabel = "not_applicable";
  if (charge !== null && alternative) {
    const alternativeCharge = newChargeCents(alternative);
    savingsCents = alternativeCharge - charge;
    savingsLabel = "estimate";
  } else if (ordered.some((candidate) => candidate.id !== chosen.id && newChargeCents(candidate) === null)) {
    savingsLabel = "unknown";
  }

  const costLabel = chosen.already_owned ? "included" : unknownCharge ? "unknown" : charge === 0 ? "none" : "estimate";
  const rejected = ordered.slice(1).map((candidate) => candidate.name);
  const tradeoff = [
    `Chose ${chosen.name} (${chosen.kind}) because it is the simplest fit.`,
    rejected.length ? `Did not choose ${rejected.join(", ")}.` : "No alternative fit.",
    chosen.kind === "build" ? "A custom tool was selected only because no owned or existing tool fit." : "A custom tool was not selected merely to avoid a subscription.",
    `Setup: ${chosen.setup}. Maintenance: ${chosen.maintenance}.`,
    chosen.security ? `Security: ${chosen.security}` : "Security notes were not recorded.",
    costLabel === "unknown" ? "Cost is unknown, so no savings figure is claimed." : `Estimated new cost: ${chosen.already_owned ? "included" : money(charge)} (${costLabel}).`,
    chosen.evidence ? `Evidence: ${chosen.evidence}` : "Cost evidence was not recorded.",
  ].join(" ");

  let reason = `${chosen.name} meets the need with the least new machinery.`;
  if (approval === "required" && overBudget) {
    reason = `${chosen.name} is the simplest fit, and the estimated charge exceeds the remaining budget. Approval is required before any charge.`;
  } else if (approval === "required" && unknownCharge) {
    reason = `${chosen.name} is the simplest fit, and its cost is unknown. Approval is required before adopting it.`;
  } else if (approval === "required") {
    reason = `${chosen.name} is the simplest fit and adds a new charge. Approval is required before that charge.`;
  }

  return {
    choice: chosen.kind,
    option_id: chosen.id,
    option_name: chosen.name,
    approval,
    reason,
    estimated_cost_cents: unknownCharge ? null : charge,
    estimated_cost_label: costLabel,
    estimated_setup: chosen.setup,
    actual_usage: ACTUAL_USAGE,
    savings_cents: savingsLabel === "estimate" ? savingsCents : null,
    savings_label: savingsLabel,
    within_budget: unknownCharge ? null : remaining === null ? true : (charge || 0) <= remaining,
    tradeoff,
  };
}

export const BRIDGE_READ_EXAMPLE = {
  need: "Show this project's bridge tasks and checkpoints inside Studio",
  candidates: [
    {
      id: "bridge-mcp",
      name: "Existing bridge MCP",
      kind: "reuse",
      already_owned: true,
      fits: true,
      setup: "hours",
      recurring_cents: 0,
      setup_cents: 0,
      maintenance: "low",
      security: "The read token stays on the server. The browser receives redacted task text only.",
      evidence: "agent-handoff-bridge 0.5.0 already exposes /health and an authenticated /mcp tools/call. No new vendor fee.",
    },
    {
      id: "hosted-tracker",
      name: "New hosted tracker",
      kind: "adopt",
      already_owned: false,
      fits: true,
      setup: "hours",
      recurring_cents: null,
      setup_cents: null,
      maintenance: "low",
      security: "A third party would store the same private task text.",
      evidence: "A current public price was not loaded, so the subscription cost is unknown.",
    },
    {
      id: "second-database",
      name: "Second task database",
      kind: "build",
      already_owned: false,
      fits: true,
      setup: "days",
      recurring_cents: 0,
      setup_cents: 0,
      maintenance: "high",
      security: "Duplicates private task text and approval history the bridge already stores.",
      evidence: "No vendor fee. The cost is ongoing maintenance, which is not converted into a dollar estimate.",
    },
  ],
};
