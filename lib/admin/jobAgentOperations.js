const CATEGORY_LABELS = Object.freeze({
  ai: "AI guidance",
  "application-package": "Application preparation",
  "document-render": "Document rendering",
  "object-storage": "Object storage",
  email: "Job Agent email",
  "employer-browser": "Employer browser",
});

function safeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function optionalInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function safeStatus(value) {
  const status = String(value || "unknown").toLowerCase();
  return ["healthy", "running", "ready", "idle", "succeeded", "degraded", "incomplete", "blocked", "failed", "unknown"].includes(status)
    ? status
    : "unknown";
}

export function normalizeJobAgentOperations(payload = {}) {
  if (payload.contentFree !== true
    || payload.containsCandidateValues === true
    || payload.queueHealth?.contentFree !== true
    || payload.queueHealth?.containsCandidateValues === true
    || payload.queueHealth?.containsAccountIdentifiers === true
    || payload.monetarySpend?.contentFree !== true
    || payload.monetarySpend?.containsCandidateValues === true) {
    const error = new Error("The Job Agent returned data outside the aggregate operations contract.");
    error.code = "unsafe_upstream_payload";
    throw error;
  }

  const day = Array.isArray(payload.monetarySpend.days) ? payload.monetarySpend.days[0] : null;
  const global = day?.global || {};
  const budget = payload.costControls?.monetaryReservationControl || {};
  const settledCents = safeInteger(global.settledCents);
  const reservedCents = safeInteger(global.reservedCents);
  const dailyCapCents = optionalInteger(budget.globalDailyCapCents);
  const categories = Object.entries(CATEGORY_LABELS).map(([key, label]) => {
    const usage = day?.categories?.[key] || {};
    const limits = budget.categories?.[key] || {};
    const categoryCapCents = optionalInteger(limits.dailyCapCents);
    const maximumRequestCents = optionalInteger(limits.maximumRequestCents);
    return {
      key,
      label,
      settledCents: safeInteger(usage.settledCents),
      reservedCents: safeInteger(usage.reservedCents),
      releasedCents: safeInteger(usage.releasedCents),
      dailyCapCents: categoryCapCents,
      maximumRequestCents,
      guarded: budget.enabled === true && budget.approved === true && categoryCapCents !== null && maximumRequestCents !== null,
    };
  });
  const queues = ["submission", "receipt", "accountExport", "operatorAlert"].map((key) => {
    const queue = payload.queueHealth?.[key] || {};
    return {
      key,
      label: { submission: "Submission", receipt: "Employer receipts", accountExport: "Account exports", operatorAlert: "Operator alerts" }[key],
      status: safeStatus(queue.status),
      pending: optionalInteger(queue.pending),
      overdue: optionalInteger(queue.overdue),
      failed: optionalInteger(queue.failed),
    };
  });
  const manifest = payload.launchManifest || {};
  const capabilities = manifest.capabilities || {};

  return {
    contentFree: true,
    updatedAt: String(payload.generatedAt || payload.updatedAt || new Date().toISOString()),
    spend: {
      currency: "USD",
      ledgerDate: day?.date || null,
      settledCents,
      reservedCents,
      releasedCents: safeInteger(global.releasedCents),
      dailyCapCents,
      remainingCents: dailyCapCents === null ? null : Math.max(0, dailyCapCents - settledCents - reservedCents),
      guardEnabled: budget.enabled === true && budget.approved === true && dailyCapCents !== null,
      evidenceNote: "Provider invoices are not connected. Ledger totals may use conservative maximums when exact provider cost is unknown.",
      categories,
    },
    worker: {
      status: safeStatus(payload.backgroundWorker?.status),
      lastSeenAt: payload.backgroundWorker?.lastSeenAt || null,
      outcome: safeStatus(payload.backgroundWorker?.outcome),
    },
    queues,
    alerts: {
      destination: manifest.discordOperatorAlerts?.ready === true ? "Private Discord channel" : "Not connected",
      discordReady: manifest.discordOperatorAlerts?.ready === true,
      deliveryReady: manifest.operatorAlerting?.ready === true,
    },
    safeguards: {
      employerBrowser: capabilities.assistedApplication?.eligible === true ? "enabled" : "disabled",
      finalSubmission: capabilities.finalSubmission?.eligible === true ? "enabled" : "disabled",
      signedBeta: capabilities.signedBeta?.eligible === true ? "ready" : "blocked",
      packagePreparation: capabilities.packageReady?.eligible === true ? "ready" : "blocked",
    },
  };
}

export async function loadJobAgentOperations({
  secret,
  fetchImpl = fetch,
  origin = "https://app.1ststep.ai",
} = {}) {
  if (String(secret || "").length < 32) {
    const error = new Error("Job Agent operations access is not configured.");
    error.code = "bridge_not_configured";
    error.statusCode = 503;
    throw error;
  }
  if (origin !== "https://app.1ststep.ai") {
    const error = new Error("The Job Agent operations origin is not allowed.");
    error.code = "bridge_origin_invalid";
    error.statusCode = 503;
    throw error;
  }
  const response = await fetchImpl(`${origin}/api/job-agent-operations?days=2`, {
    method: "GET",
    headers: { "x-1ststep-operator-bridge-secret": secret },
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Live Job Agent operations are temporarily unavailable.");
    error.code = "upstream_unavailable";
    error.statusCode = 502;
    throw error;
  }
  return normalizeJobAgentOperations(payload);
}
