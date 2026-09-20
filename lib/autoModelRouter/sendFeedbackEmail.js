import { fetchWithTimeout } from "../http/fetchWithTimeout.js";

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

export async function sendAutoModelRouterFeedbackEmail({ submission }) {
  if (!configured()) {
    return { delivered: false, provider: "resend", reason: "not_configured" };
  }

  const email = submission.email || "No email provided";
  const feedback = submission.feedback || "No written feedback provided";
  const attribution = attributionLines(submission.attribution);
  const message = {
    from: process.env.APP_IDEA_NOTIFY_FROM,
    to: [process.env.APP_IDEA_NOTIFY_TO],
    subject: submission.email
      ? `Auto Model Router feedback from ${submission.email}`
      : "Auto Model Router feedback (no email)",
    text: [
      "New Auto Model Router feedback",
      "",
      `Email: ${email}`,
      `Opt-in to tool updates: ${submission.opt_in ? "yes" : "no"}`,
      `Request ID: ${submission.request_id}`,
      `Received: ${submission.created_at}`,
      "",
      "Feedback",
      feedback,
      "",
      "Attribution",
      attribution,
    ].join("\n"),
    html: `
      <h1>New Auto Model Router feedback</h1>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Opt-in to tool updates:</strong> ${submission.opt_in ? "yes" : "no"}</p>
      <p><strong>Request ID:</strong> ${escapeHtml(submission.request_id)}</p>
      <p><strong>Received:</strong> ${escapeHtml(submission.created_at)}</p>
      <h2>Feedback</h2>
      <pre>${escapeHtml(feedback)}</pre>
      <h2>Attribution</h2>
      <pre>${escapeHtml(attribution)}</pre>
    `,
  };

  if (submission.email) {
    message.reply_to = submission.email;
  }

  const response = await fetchWithTimeout(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
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
