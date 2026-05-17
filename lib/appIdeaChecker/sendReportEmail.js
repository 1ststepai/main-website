import { REPO_CREATION_STATUS } from "./forwardLead.js";

const BOOKING_URL = "https://api.leadconnectorhq.com/widget/booking/Rb4aqLM1NdU5kvZcqNmj";

function configured() {
  return Boolean(
    process.env.RESEND_API_KEY &&
    process.env.APP_IDEA_NOTIFY_TO &&
    process.env.APP_IDEA_NOTIFY_FROM
  );
}

function safe(value, fallback = "Not provided") {
  const text = String(value || "").trim();
  return text || fallback;
}

function answer(lead, key) {
  return lead.answers && lead.answers[key] ? lead.answers[key] : "";
}

function emailText(lead) {
  return [
    "New App Idea Checker lead",
    "",
    `Name: ${safe(lead.name)}`,
    `Email: ${safe(lead.email)}`,
    `Phone: ${safe(lead.phone, "Optional / not provided")}`,
    `Score: ${lead.score}/100`,
    `Category: ${safe(lead.category)}`,
    `Lead quality: ${safe(lead.lead_quality)}`,
    `Idea text: ${safe(answer(lead, "idea_description"))}`,
    `Audience: ${safe(lead.audience)}`,
    `Problem type: ${safe(answer(lead, "problem_type"))}`,
    `Recommended path: ${safe(lead.recommended_path)}`,
    `Budget: ${safe(lead.budget)}`,
    `Lead ID: ${safe(lead.lead_id)}`,
    `Project slug: ${safe(lead.project_slug)}`,
    `Repo creation status: ${REPO_CREATION_STATUS}`,
    "",
    `Booking link: ${BOOKING_URL}`
  ].join("\n");
}

function emailHtml(lead) {
  const rows = [
    ["Name", lead.name],
    ["Email", lead.email],
    ["Phone", safe(lead.phone, "Optional / not provided")],
    ["Score", `${lead.score}/100`],
    ["Category", lead.category],
    ["Lead quality", lead.lead_quality],
    ["Idea text", answer(lead, "idea_description")],
    ["Audience", lead.audience],
    ["Problem type", answer(lead, "problem_type")],
    ["Recommended path", lead.recommended_path],
    ["Budget", lead.budget],
    ["Lead ID", lead.lead_id],
    ["Project slug", lead.project_slug],
    ["Repo creation status", REPO_CREATION_STATUS]
  ];

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2>New App Idea Checker lead</h2>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:760px">
        ${rows.map(([label, value]) => `
          <tr>
            <td style="border:1px solid #e5e7eb;font-weight:700;vertical-align:top;width:180px">${safe(label)}</td>
            <td style="border:1px solid #e5e7eb;vertical-align:top">${safe(value)}</td>
          </tr>
        `).join("")}
      </table>
      <p><a href="${BOOKING_URL}">Booking calendar</a></p>
    </div>
  `;
}

function safeError(error) {
  const message = error && error.message ? error.message : "Resend notification failed";
  return message.replace(/https?:\/\/\S+/gi, "[redacted-url]").slice(0, 180);
}

export async function sendAdminReportEmail({ lead }) {
  if (!configured()) {
    return { status: "skipped_not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.APP_IDEA_NOTIFY_FROM,
        to: process.env.APP_IDEA_NOTIFY_TO,
        subject: `New App Idea Checker lead: ${lead.score}/100 - ${lead.name}`,
        text: emailText(lead),
        html: emailHtml(lead)
      })
    });

    if (!response.ok) {
      return {
        status: "failed_non_blocking",
        error: `Resend returned HTTP ${response.status}`
      };
    }

    return { status: "sent" };
  } catch (error) {
    return {
      status: "failed_non_blocking",
      error: safeError(error)
    };
  }
}
