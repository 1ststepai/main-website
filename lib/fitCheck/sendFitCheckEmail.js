import { fetchWithTimeout } from "../http/fetchWithTimeout.js";

const TIMELINE_LABELS = {
  asap: "As soon as possible",
  "1-2-months": "Within 1–2 months",
  "3-6-months": "Within 3–6 months",
  flexible: "Flexible / exploring",
};
const BUDGET_LABELS = {
  "under-5k": "Under $5,000",
  "5k-10k": "$5,000–$10,000",
  "10k-25k": "$10,000–$25,000",
  "25k-plus": "$25,000+",
  "not-sure": "Not sure yet",
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function configured() {
  return Boolean(
    process.env.RESEND_API_KEY &&
    process.env.APP_IDEA_NOTIFY_TO &&
    process.env.APP_IDEA_NOTIFY_FROM
  );
}

function attributionLines(attribution) {
  const entries = Object.entries(attribution || {});
  return entries.length
    ? entries.map(([key, value]) => `${key}: ${value}`).join("\n")
    : "No campaign attribution captured";
}

export async function sendFitCheckEmail({ submission }) {
  if (!configured()) {
    return { delivered: false, provider: "resend", reason: "not_configured" };
  }

  const timeline = TIMELINE_LABELS[submission.timeline] || submission.timeline;
  const budget = BUDGET_LABELS[submission.budget_range] || submission.budget_range;
  const attribution = attributionLines(submission.attribution);
  const response = await fetchWithTimeout(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.APP_IDEA_NOTIFY_FROM,
        to: [process.env.APP_IDEA_NOTIFY_TO],
        reply_to: submission.email,
        subject: `Website fit check: ${new URL(submission.website_url).hostname}`,
        text: [
          "New Website Fit Check request",
          "",
          `Website: ${submission.website_url}`,
          `Email: ${submission.email}`,
          `Timeline: ${timeline}`,
          `Budget: ${budget}`,
          `Request ID: ${submission.request_id}`,
          "",
          "Attribution",
          attribution,
        ].join("\n"),
        html: `
          <h1>New Website Fit Check request</h1>
          <p><strong>Website:</strong> <a href="${escapeHtml(submission.website_url)}">${escapeHtml(submission.website_url)}</a></p>
          <p><strong>Email:</strong> ${escapeHtml(submission.email)}</p>
          <p><strong>Timeline:</strong> ${escapeHtml(timeline)}</p>
          <p><strong>Budget:</strong> ${escapeHtml(budget)}</p>
          <p><strong>Request ID:</strong> ${escapeHtml(submission.request_id)}</p>
          <h2>Attribution</h2>
          <pre>${escapeHtml(attribution)}</pre>
        `,
      }),
    },
    8000
  );

  if (!response.ok) {
    return {
      delivered: false,
      provider: "resend",
      reason: `provider_${response.status}`,
    };
  }

  const body = await response.json().catch(() => ({}));
  return { delivered: true, provider: "resend", message_id: body.id || "" };
}

