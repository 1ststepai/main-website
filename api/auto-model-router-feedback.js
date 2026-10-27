import { normalizeAutoModelRouterFeedback } from "../lib/autoModelRouter/normalizeFeedback.js";
import { sendAutoModelRouterFeedbackEmail } from "../lib/autoModelRouter/sendFeedbackEmail.js";
import {
  createJsonIntakeHandler,
  deliverIntakeEmail,
  hashSubmission,
} from "../lib/intake/jsonEndpoint.js";

function fingerprint(submission) {
  return hashSubmission({
    email: submission.email,
    feedback: submission.feedback,
    opt_in: submission.opt_in,
  });
}

function deliver(submission) {
  return deliverIntakeEmail({
    send: () => sendAutoModelRouterFeedbackEmail({ submission }),
    submission,
    failedEvent: "auto_model_router_feedback_delivery_failed",
    failedMessage: "Your feedback could not be delivered. Please try again shortly.",
    deliveredEvent: "auto_model_router_feedback_delivered",
    logFields: {
      opted_in: submission.opt_in,
      has_email: Boolean(submission.email),
      has_feedback: Boolean(submission.feedback),
    },
  });
}

export default createJsonIntakeHandler({
  maxBodyBytes: 16 * 1024,
  rateLimitScope: "auto-model-router-feedback",
  normalize: normalizeAutoModelRouterFeedback,
  fingerprint,
  deliver,
  errorEvent: "auto_model_router_feedback_error",
});
