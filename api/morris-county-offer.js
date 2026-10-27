import { normalizeMorrisCountyOffer } from "../lib/morrisOffer/normalizeMorrisCountyOffer.js";
import { sendMorrisCountyOfferEmail } from "../lib/morrisOffer/sendMorrisCountyOfferEmail.js";
import {
  createJsonIntakeHandler,
  deliverIntakeEmail,
  hashSubmission,
} from "../lib/intake/jsonEndpoint.js";

const OFFER_CAPACITY = 10;

function offerIsOpen() {
  return !["false", "0", "closed"].includes(
    String(process.env.MORRIS_COUNTY_OFFER_OPEN || "true").trim().toLowerCase()
  );
}

function fingerprint(submission) {
  return hashSubmission({
    contact_name: submission.contact_name,
    business_name: submission.business_name,
    email: submission.email,
    town: submission.town,
    website_url: submission.website_url,
    project_goal: submission.project_goal,
    marketing_opt_in: submission.marketing_opt_in,
  });
}

function deliver(submission) {
  return deliverIntakeEmail({
    send: () => sendMorrisCountyOfferEmail({ submission }),
    submission,
    failedEvent: "morris_county_offer_delivery_failed",
    failedMessage: "Your application could not be delivered. Please try again shortly.",
    deliveredEvent: "morris_county_offer_delivered",
  });
}

export default createJsonIntakeHandler({
  corsMethods: ["GET", "POST", "OPTIONS"],
  allowHeader: "GET, POST, OPTIONS",
  maxBodyBytes: 20 * 1024,
  rateLimitScope: "morris-county-offer",
  readOnly(req, _res, sendJson) {
    if (req.method !== "GET") return false;
    sendJson(_res, 200, {
      ok: true,
      open: offerIsOpen(),
      capacity: OFFER_CAPACITY,
    });
    return true;
  },
  guardPost(req, res, sendJson) {
    if (offerIsOpen()) return false;
    sendJson(res, 410, {
      ok: false,
      code: "offer_closed",
      message: "Applications for this offer are currently closed.",
    });
    return true;
  },
  normalize: normalizeMorrisCountyOffer,
  fingerprint,
  deliver,
  errorEvent: "morris_county_offer_error",
});
