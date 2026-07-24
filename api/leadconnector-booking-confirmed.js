import { createHash, timingSafeEqual } from "node:crypto";
import { track } from "@vercel/analytics/server";

const WEBSITE_STRATEGY_CALENDAR_ID = "Rb4aqLM1NdU5kvZcqNmj";
const MAX_BODY_BYTES = 32 * 1024;
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const processedEvents = globalThis.__firststepConfirmedBookings || new Map();
globalThis.__firststepConfirmedBookings = processedEvents;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function firstHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || "");
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") {
    if (Buffer.byteLength(JSON.stringify(req.body), "utf8") > MAX_BODY_BYTES) {
      const error = new Error("payload_too_large");
      error.statusCode = 413;
      throw error;
    }
    return req.body;
  }
  if (typeof req.body !== "string") return {};
  if (Buffer.byteLength(req.body, "utf8") > MAX_BODY_BYTES) {
    const error = new Error("payload_too_large");
    error.statusCode = 413;
    throw error;
  }
  return JSON.parse(req.body);
}

function secureEqual(left, right) {
  const leftHash = createHash("sha256").update(String(left)).digest();
  const rightHash = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function isAuthorizedLeadConnectorWebhook(req, secret) {
  if (!secret) return false;
  const authorization = firstHeader(req, "authorization");
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const explicit = firstHeader(req, "x-leadconnector-webhook-secret");
  return secureEqual(bearer || explicit, secret);
}

function clean(value, maximum = 255) {
  return String(value || "").trim().slice(0, maximum);
}

export function parseConfirmedBooking(payload) {
  const appointment = payload?.appointment || payload?.data?.appointment || payload?.data || payload || {};
  const eventType = clean(payload?.type || payload?.event || payload?.eventType || "appointment_update");
  const calendarId = clean(
    appointment.calendarId ||
    appointment.calendar_id ||
    payload?.calendarId ||
    payload?.calendar_id
  );
  const status = clean(
    appointment.appointmentStatus ||
    appointment.appointment_status ||
    appointment.status ||
    payload?.appointmentStatus ||
    payload?.status
  ).toLowerCase();
  const appointmentId = clean(
    appointment.id ||
    appointment.appointmentId ||
    appointment.appointment_id ||
    payload?.appointmentId ||
    payload?.appointment_id
  );

  return {
    eventType,
    calendarId,
    status,
    appointmentId,
    attribution: {
      utm_source: clean(appointment.utm_source || payload?.utm_source, 120),
      utm_medium: clean(appointment.utm_medium || payload?.utm_medium, 120),
      utm_campaign: clean(appointment.utm_campaign || payload?.utm_campaign, 120),
    },
  };
}

function prune(now = Date.now()) {
  for (const [key, expiresAt] of processedEvents) {
    if (expiresAt <= now) processedEvents.delete(key);
  }
}

function eventKey(booking) {
  return createHash("sha256")
    .update(`${booking.calendarId}:${booking.appointmentId}:confirmed`)
    .digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, code: "method_not_allowed" });
  }

  const secret = process.env.LEADCONNECTOR_ANALYTICS_WEBHOOK_SECRET;
  if (!secret) {
    return sendJson(res, 503, { ok: false, code: "webhook_not_configured" });
  }
  if (!isAuthorizedLeadConnectorWebhook(req, secret)) {
    return sendJson(res, 401, { ok: false, code: "unauthorized" });
  }

  try {
    const booking = parseConfirmedBooking(parseBody(req));
    if (booking.calendarId !== WEBSITE_STRATEGY_CALENDAR_ID) {
      return sendJson(res, 202, { ok: true, tracked: false, reason: "calendar_not_in_scope" });
    }
    if (booking.status !== "confirmed") {
      return sendJson(res, 202, { ok: true, tracked: false, reason: "appointment_not_confirmed" });
    }
    if (!booking.appointmentId) {
      return sendJson(res, 400, { ok: false, code: "appointment_id_required" });
    }

    prune();
    const key = eventKey(booking);
    if (processedEvents.has(key)) {
      return sendJson(res, 200, { ok: true, tracked: true, replayed: true });
    }

    const eventData = {
      calendar: "website_strategy_call",
      attribution: [
        booking.attribution.utm_source || "leadconnector",
        booking.attribution.utm_campaign || "unattributed",
      ].join("/").slice(0, 255),
    };
    await track("booking_confirmed", eventData, { headers: req.headers });
    processedEvents.set(key, Date.now() + EVENT_TTL_MS);

    console.log(JSON.stringify({
      event: "booking_confirmed",
      calendar: "website_strategy_call",
      appointment_ref: key.slice(0, 12),
    }));
    return sendJson(res, 200, { ok: true, tracked: true });
  } catch (error) {
    const statusCode = Number(error.statusCode) || (error instanceof SyntaxError ? 400 : 500);
    if (statusCode >= 500) {
      console.error(JSON.stringify({ event: "booking_confirmation_error" }));
    }
    return sendJson(res, statusCode, {
      ok: false,
      code: statusCode === 400 ? "invalid_payload" : "internal_error",
    });
  }
}
