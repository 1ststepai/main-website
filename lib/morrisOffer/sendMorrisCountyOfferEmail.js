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

export async function sendMorrisCountyOfferEmail({ submission }) {
  if (!configured()) {
    return { delivered: false, provider: "resend", reason: "not_configured" };
  }

  const website = submission.website_url || "No current website";
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
        subject: `Morris County website offer: ${submission.business_name}`,
        text: [
          "New Morris County Free Website application",
          "",
          `Received: ${submission.created_at}`,
          `Request ID: ${submission.request_id}`,
          `Contact: ${submission.contact_name}`,
          `Business: ${submission.business_name}`,
          `Email: ${submission.email}`,
          `Town: ${submission.town}`,
          `Current website: ${website}`,
          "",
          "What they need",
          submission.project_goal,
          "",
          "Eligibility confirmed: Yes",
          `Marketing email opt-in: ${submission.marketing_opt_in ? "Yes" : "No"}`,
          "",
          "Attribution",
          attribution,
          "",
          "Applications are reviewed in received order. Verify eligibility and scope before accepting.",
        ].join("\n"),
        html: `
          <h1>New Morris County Free Website application</h1>
          <p><strong>Received:</strong> ${escapeHtml(submission.created_at)}</p>
          <p><strong>Request ID:</strong> ${escapeHtml(submission.request_id)}</p>
          <p><strong>Contact:</strong> ${escapeHtml(submission.contact_name)}</p>
          <p><strong>Business:</strong> ${escapeHtml(submission.business_name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(submission.email)}</p>
          <p><strong>Town:</strong> ${escapeHtml(submission.town)}</p>
          <p><strong>Current website:</strong> ${submission.website_url
            ? `<a href="${escapeHtml(submission.website_url)}">${escapeHtml(submission.website_url)}</a>`
            : "No current website"}</p>
          <h2>What they need</h2>
          <p>${escapeHtml(submission.project_goal)}</p>
          <p><strong>Eligibility confirmed:</strong> Yes</p>
          <p><strong>Marketing email opt-in:</strong> ${submission.marketing_opt_in ? "Yes" : "No"}</p>
          <h2>Attribution</h2>
          <pre>${escapeHtml(attribution)}</pre>
          <hr>
          <p>Applications are reviewed in received order. Verify eligibility and scope before accepting.</p>
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
