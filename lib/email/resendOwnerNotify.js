import { fetchWithTimeout } from "../http/fetchWithTimeout.js";

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function resendOwnerNotifyConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY &&
    process.env.APP_IDEA_NOTIFY_TO &&
    process.env.APP_IDEA_NOTIFY_FROM
  );
}

export function formatAttributionLines(attribution) {
  const entries = Object.entries(attribution || {});
  return entries.length
    ? entries.map(([key, value]) => `${key}: ${value}`).join("\n")
    : "No campaign attribution captured";
}

export async function sendOwnerResendEmail({ subject, text, html, replyTo }) {
  if (!resendOwnerNotifyConfigured()) {
    return { delivered: false, provider: "resend", reason: "not_configured" };
  }

  const message = {
    from: process.env.APP_IDEA_NOTIFY_FROM,
    to: [process.env.APP_IDEA_NOTIFY_TO],
    subject,
    text,
    html,
  };
  if (replyTo) message.reply_to = replyTo;

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
