import { handlePublicJsonPost } from "../lib/http/publicJsonPost.js";
import { normalizeAutoModelRouterFeedback } from "../lib/autoModelRouter/normalizeFeedback.js";
import { sendAutoModelRouterFeedbackEmail } from "../lib/autoModelRouter/sendFeedbackEmail.js";

async function deliver(submission) {
  const email = await sendAutoModelRouterFeedbackEmail({ submission });
  if (!email.delivered) {
    console.error(JSON.stringify({
      event: "auto_model_router_feedback_delivery_failed",
      request_id: submission.request_id,
      reason: email.reason || "unknown",
    }));
    return {
      statusCode: 503,
      payload: {
        ok: false,
        code: "delivery_unavailable",
        message: "Your feedback could not be delivered. Please try again shortly.",
      },
    };
  }

  console.log(JSON.stringify({
    event: "auto_model_router_feedback_delivered",
    request_id: submission.request_id,
    provider: email.provider,
    opted_in: submission.opt_in,
    has_email: Boolean(submission.email),
    has_feedback: Boolean(submission.feedback),
  }));
  return {
    statusCode: 201,
    payload: { ok: true, request_id: submission.request_id },
  };
}

export default async function handler(req, res) {
  return handlePublicJsonPost(req, res, {
    scope: "auto-model-router-feedback",
    normalize: normalizeAutoModelRouterFeedback,
    fingerprintFields: (submission) => ({
      email: submission.email,
      feedback: submission.feedback,
      opt_in: submission.opt_in,
    }),
    deliver,
    errorEvent: "auto_model_router_feedback_error",
  });
}
