import test from "node:test";
import assert from "node:assert/strict";
import handler, {
  isAuthorizedLeadConnectorWebhook,
  parseConfirmedBooking,
} from "../api/leadconnector-booking-confirmed.js";

function mockResponse() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: "",
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), String(value));
    },
    end(value = "") {
      this.body = String(value);
    },
  };
}

function request(body, secret = "confirmed-test-secret") {
  return {
    method: "POST",
    body,
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "user-agent": "node-test",
      "x-forwarded-for": "203.0.113.220",
    },
  };
}

test("parses supported LeadConnector appointment payload shapes", () => {
  const booking = parseConfirmedBooking({
    type: "AppointmentUpdate",
    appointment: {
      id: "apt_123",
      calendarId: "Rb4aqLM1NdU5kvZcqNmj",
      appointmentStatus: "confirmed",
    },
    utm_source: "google",
  });

  assert.equal(booking.appointmentId, "apt_123");
  assert.equal(booking.calendarId, "Rb4aqLM1NdU5kvZcqNmj");
  assert.equal(booking.status, "confirmed");
  assert.equal(booking.attribution.utm_source, "google");
});

test("compares webhook secrets without accepting a partial match", () => {
  assert.equal(isAuthorizedLeadConnectorWebhook(request({}), "confirmed-test-secret"), true);
  assert.equal(isAuthorizedLeadConnectorWebhook(request({}, "confirmed-test"), "confirmed-test-secret"), false);
});

test("tracks only confirmed appointments on the website calendar and deduplicates retries", async (t) => {
  t.mock.method(console, "log", () => {});
  process.env.LEADCONNECTOR_ANALYTICS_WEBHOOK_SECRET = "confirmed-test-secret";
  const body = {
    type: "CustomerBookedAppointment",
    appointmentId: "apt_confirmed_901",
    calendarId: "Rb4aqLM1NdU5kvZcqNmj",
    appointmentStatus: "confirmed",
    utm_source: "linkedin",
    utm_campaign: "website-rebuild",
  };

  const firstResponse = mockResponse();
  await handler(request(body), firstResponse);
  assert.equal(firstResponse.statusCode, 200);
  assert.equal(JSON.parse(firstResponse.body).tracked, true);

  const replayResponse = mockResponse();
  await handler(request(body), replayResponse);
  assert.equal(replayResponse.statusCode, 200);
  assert.equal(JSON.parse(replayResponse.body).replayed, true);
});

test("ignores unconfirmed appointments and other calendars", async () => {
  process.env.LEADCONNECTOR_ANALYTICS_WEBHOOK_SECRET = "confirmed-test-secret";

  const pendingResponse = mockResponse();
  await handler(request({
    appointmentId: "apt_pending_901",
    calendarId: "Rb4aqLM1NdU5kvZcqNmj",
    appointmentStatus: "new",
  }), pendingResponse);
  assert.equal(pendingResponse.statusCode, 202);
  assert.equal(JSON.parse(pendingResponse.body).reason, "appointment_not_confirmed");

  const otherResponse = mockResponse();
  await handler(request({
    appointmentId: "apt_other_901",
    calendarId: "another-calendar",
    appointmentStatus: "confirmed",
  }), otherResponse);
  assert.equal(otherResponse.statusCode, 202);
  assert.equal(JSON.parse(otherResponse.body).reason, "calendar_not_in_scope");
});

test("fails closed when the webhook secret is missing", async () => {
  delete process.env.LEADCONNECTOR_ANALYTICS_WEBHOOK_SECRET;
  const res = mockResponse();
  await handler(request({}), res);
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.parse(res.body).code, "webhook_not_configured");
});
