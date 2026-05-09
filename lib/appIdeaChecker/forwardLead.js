const PIPELINE_STAGE = "New Idea Checker Lead";
const REPO_CREATION_STATUS = "locked_until_signed_and_paid";

function safeErrorMessage(error) {
  const message = error && error.message ? error.message : "Forwarding request failed";
  return message.replace(/https?:\/\/\S+/gi, "[redacted-url]").slice(0, 240);
}

function stageSuggestion(lead) {
  if (lead.lead_quality === "high") {
    return "Prioritize discovery call and proposal fit.";
  }
  if (lead.lead_quality === "medium") {
    return "Send validation-focused follow-up and invite a strategy call.";
  }
  return "Send validation resources before recommending a build.";
}

export function buildForwardingPayload({ lead, contextPackStatus, generatedFiles }) {
  return {
    source: lead.source,
    lead_id: lead.lead_id,
    project_slug: lead.project_slug,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    score: lead.score,
    category: lead.category,
    lead_quality: lead.lead_quality,
    idea_type: lead.idea_type,
    audience: lead.audience,
    budget: lead.budget,
    launch_timeline: lead.launch_timeline,
    recommended_path: lead.recommended_path,
    tags: lead.tags,
    answers: lead.answers,
    context_pack_status: contextPackStatus,
    generated_files: generatedFiles,
    server_created_at: lead.server_created_at,
    pipeline_stage: PIPELINE_STAGE,
    stage_suggestion: stageSuggestion(lead),
    repo_creation_status: REPO_CREATION_STATUS
  };
}

async function postWebhook(label, url, payload) {
  if (!url) {
    return { status: "skipped_missing_url" };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return {
        status: "failed",
        error: `${label} webhook returned HTTP ${response.status}`
      };
    }

    return { status: "sent" };
  } catch (error) {
    return {
      status: "failed",
      error: safeErrorMessage(error)
    };
  }
}

export async function forwardLead({ lead, contextPackStatus, generatedFiles }) {
  const enabled = process.env.APP_IDEA_FORWARDING_ENABLED === "true";
  const base = { enabled };

  if (!enabled) {
    return {
      ...base,
      ghl: { status: "skipped_disabled" }
    };
  }

  const payload = buildForwardingPayload({ lead, contextPackStatus, generatedFiles });
  const [ghl, zapier, make, custom] = await Promise.all([
    postWebhook("GHL", process.env.APP_IDEA_GHL_WEBHOOK_URL, payload),
    process.env.APP_IDEA_ZAPIER_WEBHOOK_URL
      ? postWebhook("Zapier", process.env.APP_IDEA_ZAPIER_WEBHOOK_URL, payload)
      : Promise.resolve({ status: "skipped_missing_url" }),
    process.env.APP_IDEA_MAKE_WEBHOOK_URL
      ? postWebhook("Make.com", process.env.APP_IDEA_MAKE_WEBHOOK_URL, payload)
      : Promise.resolve({ status: "skipped_missing_url" }),
    process.env.APP_IDEA_CUSTOM_WEBHOOK_URL
      ? postWebhook("Custom", process.env.APP_IDEA_CUSTOM_WEBHOOK_URL, payload)
      : Promise.resolve({ status: "skipped_missing_url" })
  ]);

  return {
    ...base,
    ghl,
    zapier,
    make,
    custom
  };
}

export { PIPELINE_STAGE, REPO_CREATION_STATUS };
