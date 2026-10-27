import { normalizeFitCheck } from "../lib/fitCheck/normalizeFitCheck.js";
import { sendFitCheckEmail } from "../lib/fitCheck/sendFitCheckEmail.js";
import {
  createJsonIntakeHandler,
  deliverIntakeEmail,
  hashSubmission,
} from "../lib/intake/jsonEndpoint.js";

function fingerprint(submission) {
  return hashSubmission({
    website_url: submission.website_url,
    email: submission.email,
    timeline: submission.timeline,
    budget_range: submission.budget_range,
  });
}

function deliver(submission) {
  return deliverIntakeEmail({
    send: () => sendFitCheckEmail({ submission }),
    submission,
    failedEvent: "fit_check_delivery_failed",
    failedMessage: "Your request could not be delivered. Please book a Website Strategy Call instead.",
    deliveredEvent: "fit_check_delivered",
  });
}

export default createJsonIntakeHandler({
  maxBodyBytes: 16 * 1024,
  rateLimitScope: "fit-check",
  normalize: normalizeFitCheck,
  fingerprint,
  deliver,
  errorEvent: "fit_check_error",
});
