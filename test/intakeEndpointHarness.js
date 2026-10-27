import assert from "node:assert/strict";

export function intakeResponse() {
  const state = { statusCode: 200, body: "", headers: new Map() };
  state.setHeader = (name, value) => {
    state.headers.set(String(name).toLowerCase(), String(value));
  };
  state.end = (value = "") => {
    state.body = String(value);
  };
  return state;
}

export function intakeRequest(body, extraHeaders = {}) {
  const octet = Math.floor(Math.random() * 180) + 1;
  const headers = Object.assign({
    "content-type": "application/json",
    host: "www.1ststep.ai",
    origin: "https://www.1ststep.ai",
    "x-forwarded-for": `203.0.113.${octet}`,
  }, extraHeaders);
  return { method: "POST", body, headers };
}

export async function expectDelivered(t, {
  handler,
  body,
  idempotencyKey,
  requestIdPattern,
  omittedFields,
  providerMessageId,
  inspect,
}) {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    inspect(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: providerMessageId }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  t.mock.method(console, "log", () => {});
  process.env.RESEND_API_KEY = "re_test";
  process.env.APP_IDEA_NOTIFY_TO = "owner@1ststep.ai";
  process.env.APP_IDEA_NOTIFY_FROM = "Website <website@1ststep.ai>";

  const response = intakeResponse();
  await handler(intakeRequest(body, { "idempotency-key": idempotencyKey }), response);
  const parsed = JSON.parse(response.body);
  assert.equal(response.statusCode, 201);
  assert.equal(parsed.ok, true);
  assert.match(parsed.request_id, requestIdPattern);
  for (const field of omittedFields) assert.equal(parsed[field], undefined);
}

export async function expectClosedDelivery(t, handler, body, idempotencyKey) {
  t.mock.method(console, "error", () => {});
  delete process.env.RESEND_API_KEY;
  delete process.env.APP_IDEA_NOTIFY_TO;
  delete process.env.APP_IDEA_NOTIFY_FROM;

  const response = intakeResponse();
  await handler(intakeRequest(body, { "idempotency-key": idempotencyKey }), response);
  const parsed = JSON.parse(response.body);
  assert.equal(response.statusCode, 503);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, "delivery_unavailable");
}

export async function expectOriginRejected(handler, body) {
  const response = intakeResponse();
  await handler(intakeRequest(body, { origin: "https://attacker.example" }), response);
  assert.equal(response.statusCode, 403);
  assert.equal(JSON.parse(response.body).code, "origin_not_allowed");
}
