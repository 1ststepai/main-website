import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/morris-county-offer.js";
import {
  MORRIS_COUNTY_MUNICIPALITIES,
  normalizeMorrisCountyOffer,
  validateMorrisCountyOfferPayload,
} from "../lib/morrisOffer/normalizeMorrisCountyOffer.js";

function payload(overrides = {}) {
  return {
    contact_name: "Jordan Owner",
    business_name: "Morris County Coffee",
    email: "owner@example.com",
    town: "Randolph",
    website_url: "",
    project_goal: "We need a polished website that explains our services and makes it easy to contact us.",
    eligibility_confirmed: true,
    marketing_opt_in: true,
    attribution: {
      utm_source: "instagram",
      utm_campaign: "morris-county-free-website-10",
      malicious_field: "<script>alert(1)</script>",
    },
    ...overrides,
  };
}

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

function mockRequest(body, headers = {}, method = "POST") {
  return {
    method,
    body,
    headers: {
      "content-type": "application/json",
      host: "www.1ststep.ai",
      origin: "https://www.1ststep.ai",
      "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 180) + 1}`,
      ...headers,
    },
  };
}

test("normalizes a qualified Morris County application and minimizes attribution", () => {
  const result = normalizeMorrisCountyOffer(payload());

  assert.equal(MORRIS_COUNTY_MUNICIPALITIES.length, 39);
  assert.equal(result.contact_name, "Jordan Owner");
  assert.equal(result.business_name, "Morris County Coffee");
  assert.equal(result.email, "owner@example.com");
  assert.equal(result.town, "Randolph");
  assert.equal(result.website_url, "");
  assert.equal(result.marketing_opt_in, true);
  assert.equal(result.attribution.utm_source, "instagram");
  assert.equal(result.attribution.malicious_field, undefined);
  assert.match(result.request_id, /^morris_/);
});

test("rejects non-local, unconfirmed, and unexpected applications", () => {
  const errors = validateMorrisCountyOfferPayload(payload({
    town: "Newark",
    eligibility_confirmed: false,
    admin: true,
  }));

  assert.ok(errors.some((error) => error.includes("unexpected fields")));
  assert.ok(errors.some((error) => error.includes("Morris County municipality")));
  assert.ok(errors.some((error) => error.includes("eligibility")));
});

test("delivers the application without returning personal information", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const email = JSON.parse(options.body);
    assert.match(email.subject, /Morris County Coffee/);
    assert.match(email.html, /owner@example\.com/);
    assert.match(email.html, /Randolph/);
    assert.match(email.html, /Marketing email opt-in:<\/strong> Yes/);
    assert.doesNotMatch(email.html, /malicious_field/);
    return new Response(JSON.stringify({ id: "email_morris_123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  t.mock.method(console, "log", () => {});
  process.env.RESEND_API_KEY = "re_test";
  process.env.APP_IDEA_NOTIFY_TO = "owner@1ststep.ai";
  process.env.APP_IDEA_NOTIFY_FROM = "Website <website@1ststep.ai>";
  delete process.env.MORRIS_COUNTY_OFFER_OPEN;

  const req = mockRequest(payload(), { "idempotency-key": "morris:test:delivery:001" });
  const res = mockResponse();
  await handler(req, res);

  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 201);
  assert.equal(body.ok, true);
  assert.match(body.request_id, /^morris_/);
  assert.equal(body.email, undefined);
  assert.equal(body.business_name, undefined);
});

test("exposes only campaign availability and closes applications by environment switch", async (t) => {
  t.after(() => delete process.env.MORRIS_COUNTY_OFFER_OPEN);
  process.env.MORRIS_COUNTY_OFFER_OPEN = "false";

  const statusReq = mockRequest(undefined, {}, "GET");
  const statusRes = mockResponse();
  await handler(statusReq, statusRes);
  assert.equal(statusRes.statusCode, 200);
  assert.deepEqual(JSON.parse(statusRes.body), { ok: true, open: false, capacity: 10 });

  const applyReq = mockRequest(payload(), { "idempotency-key": "morris:test:closed:001" });
  const applyRes = mockResponse();
  await handler(applyReq, applyRes);
  assert.equal(applyRes.statusCode, 410);
  assert.equal(JSON.parse(applyRes.body).code, "offer_closed");
});

test("rejects hostile cross-origin campaign applications", async () => {
  const req = mockRequest(payload(), { origin: "https://attacker.example" });
  const res = mockResponse();
  await handler(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).code, "origin_not_allowed");
});
