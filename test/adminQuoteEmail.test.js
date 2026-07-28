import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  ADMIN_EMAIL_FROM,
  ADMIN_EMAIL_REPLY_TO,
  quoteEmailHtml,
  quoteEmailText,
  sendQuoteEmail,
} from "../lib/admin/sendQuoteEmail.js";
import { DEFAULT_CONTRACT_TEMPLATES } from "../lib/admin/workspaceModel.js";

function fixture() {
  return {
    client: {
      company: "Example & Co",
      contact_name: "Avery <Owner>",
      email: "avery@example.com",
    },
    quote: {
      id: "quote_1",
      quote_number: "FS-0001",
      project_title: "Website <Build>",
      summary: "A polished & useful website.",
      deposit_percent: 50,
      payment_plan: "three_payments",
      payment_links: [{
        installment_number: 1,
        label: "Project deposit",
        amount: 2000,
        url: "https://buy.stripe.com/test_123",
        stripe_payment_link_id: "plink_123",
        created_at: "2026-07-24T12:00:00.000Z",
      }],
      line_items: [{
        id: "item_1",
        name: "Design",
        description: "Interface & system",
        quantity: 1,
        rate: 5000,
      }],
      contract_sections: structuredClone(DEFAULT_CONTRACT_TEMPLATES[0].sections),
    },
  };
}

test("quote email escapes stored client and quote content", () => {
  const html = quoteEmailHtml({ ...fixture(), note: "Hello <script>alert(1)</script>" });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Avery &lt;Owner&gt;/);
  assert.match(html, /Website &lt;Build&gt;/);
  assert.match(html, /Example/);
  assert.match(html, /\$5,000\.00/);
  assert.match(html, /3 payments/);
  assert.match(html, /\$2,000\.00/);
  assert.match(html, /https:\/\/buy\.stripe\.com\/test_123/);
  assert.match(html, /credit or debit card/);
  assert.match(html, /fill and sign the attached PDF/i);
  assert.match(quoteEmailText(fixture()), /fill and sign the attached PDF/i);
});

test("quote email never renders an untrusted payment URL", () => {
  const data = fixture();
  data.quote.payment_links[0].url = "https://example.com/steal";
  const html = quoteEmailHtml(data);
  assert.doesNotMatch(html, /example\.com/);
});

test("quote email uses fixed owner sender, saved client recipient, and idempotency", async () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "re_test";
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: "email_123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const result = await sendQuoteEmail({
      ...fixture(),
      idempotencyKey: "quote-send/quote_1/request_1",
    });
    assert.equal(result.id, "email_123");
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.options.headers["Idempotency-Key"], "quote-send/quote_1/request_1");
    const body = JSON.parse(request.options.body);
    assert.equal(body.from, ADMIN_EMAIL_FROM);
    assert.equal(body.reply_to, ADMIN_EMAIL_REPLY_TO);
    assert.deepEqual(body.to, ["avery@example.com"]);
    assert.equal(body.attachments.length, 1);
    assert.equal(body.attachments[0].filename, "1stStep-FS-0001-Website-Build.pdf");
    const attachment = Buffer.from(body.attachments[0].content, "base64");
    assert.equal(attachment.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok((await PDFDocument.load(attachment)).getForm().getField("client_signature"));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }
});

test("follow-up delivery is clearly labeled without changing the recipient", async () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "re_test";
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: "email_follow_up" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await sendQuoteEmail({
      ...fixture(),
      deliveryKind: "follow_up",
      idempotencyKey: "quote-follow-up/quote_1/request_1",
    });
    assert.deepEqual(body.to, ["avery@example.com"]);
    assert.match(body.subject, /^Follow-up: Quote FS-0001:/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }
});

test("quote email rejects an invalid saved recipient before delivery", async () => {
  const previousKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test";
  const data = fixture();
  data.client.email = "not-an-email";
  try {
    await assert.rejects(
      sendQuoteEmail({ ...data, idempotencyKey: "quote-send/quote_1/request_2" }),
      /valid client email/
    );
  } finally {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }
});
