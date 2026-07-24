import test from "node:test";
import assert from "node:assert/strict";

process.env.VERCEL = "1";
process.env.NODE_ENV = "test";
process.env.APP_ALLOWED_ORIGINS = "http://127.0.0.1:4173";

const { default: handler } = await import("../api/app-idea-checker.js");
const { normalizeLead, validateLeadPayload } = await import("../lib/appIdeaChecker/normalizeLead.js");
const { emailHtml } = await import("../lib/appIdeaChecker/sendReportEmail.js");
const { checkRateLimit } = await import("../lib/http/rateLimit.js");

function basePayload(overrides = {}) {
  return {
    source: "app_idea_checker",
    name: "Test Founder",
    email: "founder@example.com",
    phone: "",
    score: 78,
    category: "Viable, Needs Validation",
    idea_type: "Workflow dashboard",
    audience: "Small business owners",
    budget: "$3,000-$10,000",
    launch_timeline: "1-3 months",
    recommended_path: "Build the narrowest useful workflow.",
    tags: ["app_idea_checker"],
    answers: {
      idea_description: "A focused workflow for service operators.",
      mockup_preview: { title: "Workflow overview" }
    },
    created_at: "2026-07-22T00:00:00.000Z",
    ...overrides
  };
}

function mockResponse() {
  const headers = new Map();
  let body = "";
  return {
    statusCode: 200,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    end(value = "") {
      body = value;
    },
    result() {
      return {
        statusCode: this.statusCode,
        headers,
        body: body ? JSON.parse(body) : null
      };
    }
  };
}

function mockRequest(payload, overrides = {}) {
  const uniqueIp = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  return {
    method: "POST",
    headers: {
      host: "127.0.0.1:4173",
      origin: "http://127.0.0.1:4173",
      "x-forwarded-proto": "http",
      "x-forwarded-for": uniqueIp,
      "content-type": "application/json"
    },
    body: payload,
    ...overrides
  };
}

async function callHandler(req) {
  const res = mockResponse();
  await handler(req, res);
  return res.result();
}

async function withEmailDelivery(run) {
  const originalFetch = globalThis.fetch;
  const original = {
    key: process.env.RESEND_API_KEY,
    to: process.env.APP_IDEA_NOTIFY_TO,
    from: process.env.APP_IDEA_NOTIFY_FROM
  };
  process.env.RESEND_API_KEY = "test-key";
  process.env.APP_IDEA_NOTIFY_TO = "owner@example.com";
  process.env.APP_IDEA_NOTIFY_FROM = "site@example.com";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ id: "email-test" }), { status: 200 });
  };

  try {
    await run(() => calls);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({
      RESEND_API_KEY: original.key,
      APP_IDEA_NOTIFY_TO: original.to,
      APP_IDEA_NOTIFY_FROM: original.from
    })) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

test("normalizes a lead without putting the person's name in the project slug", () => {
  const lead = normalizeLead(basePayload());
  assert.match(lead.project_slug, /^workflow-dashboard-[a-f0-9]{8}$/);
  assert.equal(lead.project_slug.includes("test-founder"), false);
  assert.equal(typeof lead.answers.mockup_preview, "string");
});

test("rejects unexpected and oversized input", () => {
  const errors = validateLeadPayload(basePayload({
    admin: true,
    name: "x".repeat(121)
  }));
  assert.ok(errors.some((error) => error.includes("unexpected fields: admin")));
  assert.ok(errors.some((error) => error.includes("name must be 120")));
});

test("escapes untrusted lead values in the admin email HTML", () => {
  const html = emailHtml(normalizeLead(basePayload({ name: '<img src=x onerror="alert(1)">' })));
  assert.equal(html.includes("<img src=x"), false);
  assert.ok(html.includes("&lt;img src=x"));
});

test("rejects a hostile browser origin", async () => {
  const response = await callHandler(mockRequest(basePayload(), {
    headers: {
      host: "127.0.0.1:4173",
      origin: "https://attacker.example",
      "x-forwarded-proto": "http",
      "x-forwarded-for": "203.0.113.201",
      "content-type": "application/json"
    }
  }));
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, "origin_not_allowed");
  assert.equal(response.headers.has("access-control-allow-origin"), false);
});

test("returns 503 instead of claiming success when no delivery path succeeds", async () => {
  delete process.env.RESEND_API_KEY;
  delete process.env.APP_IDEA_NOTIFY_TO;
  delete process.env.APP_IDEA_NOTIFY_FROM;
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await callHandler(mockRequest(basePayload()));
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.code, "intake_unavailable");
    assert.equal(response.body.ok, false);
  } finally {
    console.error = originalError;
  }
});

test("returns a minimized success response when admin email delivery succeeds", async () => {
  await withEmailDelivery(async () => {
    const response = await callHandler(mockRequest(basePayload()));
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.delivery.admin_notified, true);
    assert.equal("preview_files" in response.body.storage, false);
    assert.equal(JSON.stringify(response.body).includes("founder@example.com"), false);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});

test("replays a successful idempotent submission without a duplicate email", async () => {
  await withEmailDelivery(async (calls) => {
    const idempotencyKey = "test-idempotency-2026-07-22";
    const req = mockRequest(basePayload());
    req.headers["idempotency-key"] = idempotencyKey;
    const first = await callHandler(req);
    const second = await callHandler(req);
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(second.headers.get("idempotency-replayed"), "true");
    assert.equal(calls(), 1);
  });
});

test("rejects reuse of an idempotency key with a different payload", async () => {
  await withEmailDelivery(async () => {
    const idempotencyKey = "test-conflict-2026-07-22";
    const first = mockRequest(basePayload());
    first.headers["idempotency-key"] = idempotencyKey;
    const second = mockRequest(basePayload({ score: 79 }));
    second.headers["idempotency-key"] = idempotencyKey;
    assert.equal((await callHandler(first)).statusCode, 200);
    const conflict = await callHandler(second);
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.body.code, "idempotency_conflict");
  });
});

test("limits repeated requests without storing a raw IP address", () => {
  const req = mockRequest(basePayload());
  const scope = `test-${Date.now()}-${Math.random()}`;
  let result;
  for (let index = 0; index < 13; index += 1) {
    result = checkRateLimit(req, scope);
  }
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 0);
  assert.ok(result.retryAfterSeconds > 0);
});
