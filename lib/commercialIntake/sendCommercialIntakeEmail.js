import { fetchWithTimeout } from "../http/fetchWithTimeout.js";

const INTENT_LABELS = {
  build_new: "Build something new",
  finish_build: "Finish something already started",
  automate_business: "Automate a business workflow",
};

const CATEGORY_LABELS = {
  website: "New website",
  "website-rebuild": "Existing website rebuild",
  "web-app-saas": "Web app / SaaS",
  "dashboard-portal": "Dashboard / portal",
  "ai-system-agent": "AI system / agent",
  "mobile-app": "Mobile app",
  "internal-tool": "Internal tool",
  "automation-integration": "Automation / integration",
  other: "Other custom build",
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function deliveryConfig() {
  const preview = process.env.VERCEL_ENV === "preview";
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.COMMERCIAL_INTAKE_NOTIFY_FROM || process.env.APP_IDEA_NOTIFY_FROM;
  const to = preview
    ? process.env.COMMERCIAL_INTAKE_PREVIEW_TO
    : (process.env.COMMERCIAL_INTAKE_NOTIFY_TO || process.env.APP_IDEA_NOTIFY_TO);

  if (preview && process.env.COMMERCIAL_INTAKE_PREVIEW_ENABLED !== "true") {
    return { configured: false, preview, reason: "preview_delivery_disabled" };
  }
  if (!apiKey || !from || !to) {
    return { configured: false, preview, reason: "not_configured" };
  }
  return { configured: true, preview, apiKey, from, to };
}

function attributionLines(attribution) {
  const entries = Object.entries(attribution || {});
  return entries.length
    ? entries.map(([key, value]) => `${key}: ${value}`).join("\n")
    : "No campaign attribution captured";
}

export async function sendCommercialIntakeEmail({ submission }) {
  const config = deliveryConfig();
  if (!config.configured) {
    return { accepted: false, provider: "resend", reason: config.reason };
  }

  const intent = INTENT_LABELS[submission.intent] || submission.intent;
  const category = CATEGORY_LABELS[submission.build_category] || submission.build_category;
  const prefix = config.preview ? "[PREVIEW TEST] " : "";
  const fields = [
    ["Intent", intent],
    ["Build category", category],
    ["Desired result", submission.desired_result],
    ["Current stage", submission.current_stage],
    ["What exists", submission.what_exists],
    ["Public project URL", submission.project_url],
    ["Current tools", submission.current_tools],
    ["Biggest blocker", submission.biggest_blocker],
    ["Deadline", submission.deadline],
    ["Budget context", submission.budget_range],
    ["Email", submission.email],
    ["Request ID", submission.request_id],
  ].filter(([, value]) => value);
  const attribution = attributionLines(submission.attribution);

  const response = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [config.to],
      reply_to: submission.email,
      subject: `${prefix}1stStep commercial request: ${intent}`,
      text: [
        `${prefix}New 1stStep.ai commercial request`,
        "",
        ...fields.map(([label, value]) => `${label}: ${value}`),
        "",
        "Attribution",
        attribution,
        "",
        "Provider acceptance confirms the submission entered the approved delivery provider. It does not prove inbox delivery or that a person has read it.",
      ].join("\n"),
      html: `
        <h1>${escapeHtml(prefix)}New 1stStep.ai commercial request</h1>
        ${fields.map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("")}
        <h2>Attribution</h2>
        <pre>${escapeHtml(attribution)}</pre>
        <p><small>Provider acceptance confirms the submission entered the approved delivery provider. It does not prove inbox delivery or that a person has read it.</small></p>
      `,
    }),
  }, 8000);

  if (!response.ok) {
    return { accepted: false, provider: "resend", reason: `provider_${response.status}` };
  }

  const body = await response.json().catch(() => ({}));
  return { accepted: true, provider: "resend", message_id: body.id || "", preview: config.preview };
}
