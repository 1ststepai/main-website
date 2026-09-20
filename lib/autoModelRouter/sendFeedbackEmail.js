import { escapeHtml, formatAttributionLines, sendOwnerResendEmail } from "../email/resendOwnerNotify.js";

export async function sendAutoModelRouterFeedbackEmail({ submission }) {
  const email = submission.email || "No email provided";
  const feedback = submission.feedback || "No written feedback provided";
  const attribution = formatAttributionLines(submission.attribution);

  return sendOwnerResendEmail({
    subject: submission.email
      ? `Auto Model Router feedback from ${submission.email}`
      : "Auto Model Router feedback (no email)",
    replyTo: submission.email || "",
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
  });
}
