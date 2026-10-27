import { normalizeCommercialIntake } from "../lib/commercialIntake/normalizeCommercialIntake.js";
import { sendCommercialIntakeEmail } from "../lib/commercialIntake/sendCommercialIntakeEmail.js";
import { createJsonIntakeHandler, hashSubmission } from "../lib/intake/jsonEndpoint.js";

function fingerprint(submission) {
  const { request_id: _requestId, created_at: _createdAt, ...stable } = submission;
  return hashSubmission(stable);
}

async function deliver(submission) {
  const email = await sendCommercialIntakeEmail({ submission });
  if (!email.accepted) {
    console.error(JSON.stringify({
      event: "commercial_intake_delivery_failed",
      request_id: submission.request_id,
      reason: email.reason || "unknown",
      preview: process.env.VERCEL_ENV === "preview",
    }));
    return {
      statusCode: 503,
      payload: {
        ok: false,
        code: "delivery_unavailable",
        message: "Your request could not be sent. Your answers are still on this page; please try again or use the email option.",
      },
    };
  }

  console.log(JSON.stringify({
    event: "commercial_intake_accepted",
    request_id: submission.request_id,
    provider: email.provider,
    intent: submission.intent,
    preview: Boolean(email.preview),
  }));
  return {
    statusCode: 201,
    payload: {
      ok: true,
      accepted: true,
      request_id: submission.request_id,
      message: "Your request was sent successfully.",
    },
  };
}

export default createJsonIntakeHandler({
  maxBodyBytes: 24 * 1024,
  rateLimitScope: "commercial-intake",
  rateLimitedPayload: {
    ok: false,
    code: "rate_limited",
    message: "Please wait before trying again.",
  },
  normalize: normalizeCommercialIntake,
  fingerprint,
  deliver,
  errorEvent: "commercial_intake_error",
});
