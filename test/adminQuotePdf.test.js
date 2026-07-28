import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import {
  generateQuotePdf,
  quotePdfFilename,
} from "../lib/admin/quotePdf.js";
import { DEFAULT_CONTRACT_TEMPLATES } from "../lib/admin/workspaceModel.js";
import quotePdfHandler from "../api/admin-quote-pdf.js";

function fixture() {
  return {
    client: {
      company: "Example & Co",
      contact_name: "Avery Owner",
      email: "avery@example.com",
      phone: "555-0100",
      billing_address: "100 Main Street\nNew York, NY 10001",
    },
    quote: {
      id: "quote_1",
      quote_number: "FS-0001",
      project_title: "Premium Website Build",
      summary: "Design and development of a polished marketing website.",
      created_at: "2026-07-25T12:00:00.000Z",
      valid_until: "2026-08-08",
      payment_plan: "three_payments",
      payment_links: [],
      notes: "Client will provide final approved copy.",
      line_items: [{
        id: "item_1",
        name: "Design and development",
        description: "Strategy, responsive design, motion, build, and launch support.",
        quantity: 1,
        rate: 5000,
      }],
      contract_sections: structuredClone(DEFAULT_CONTRACT_TEMPLATES[0].sections),
    },
  };
}

test("quote PDF is interactive and contains the required electronic acceptance fields", async () => {
  const bytes = await generateQuotePdf(fixture());
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString("ascii"), "%PDF-");

  const document = await PDFDocument.load(bytes);
  assert.ok(document.getPageCount() >= 2);

  const fields = document.getForm().getFields();
  const names = fields.map((field) => field.getName()).sort();
  assert.deepEqual(names, [
    "client_acceptance",
    "client_legal_name",
    "client_signature",
    "client_signature_date",
    "client_title",
    "firststep_signature",
    "firststep_signature_date",
  ]);
  assert.ok(fields.find((field) => field.getName() === "client_signature") instanceof PDFTextField);
  assert.ok(fields.find((field) => field.getName() === "client_acceptance") instanceof PDFCheckBox);
  assert.equal(document.getForm().getTextField("client_signature").getText(), undefined);
  assert.equal(document.getForm().getCheckBox("client_acceptance").isChecked(), false);
});

test("quote PDF filenames are stable and safe for email attachments", () => {
  assert.equal(quotePdfFilename(fixture().quote), "1stStep-FS-0001-Premium-Website-Build.pdf");
  assert.equal(
    quotePdfFilename({ quote_number: "FS/../../1", project_title: "Build\r\nBcc: test@example.com" }),
    "1stStep-FS-1-Build-Bcc-test-example-com.pdf"
  );
});

test("client acceptance values survive saving and reopening the fillable PDF", async () => {
  const document = await PDFDocument.load(await generateQuotePdf(fixture()));
  const form = document.getForm();
  form.getTextField("client_legal_name").setText("Avery Owner");
  form.getTextField("client_title").setText("Owner");
  form.getTextField("client_signature").setText("Avery Owner");
  form.getTextField("client_signature_date").setText("07/25/2026");
  form.getCheckBox("client_acceptance").check();
  const completedBytes = await document.save();

  const completed = await PDFDocument.load(completedBytes);
  assert.equal(completed.getForm().getTextField("client_legal_name").getText(), "Avery Owner");
  assert.equal(completed.getForm().getTextField("client_signature").getText(), "Avery Owner");
  assert.equal(completed.getForm().getTextField("client_signature_date").getText(), "07/25/2026");
  assert.equal(completed.getForm().getCheckBox("client_acceptance").isChecked(), true);
});

test("quote PDF download is protected by the admin session", async () => {
  const response = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(value) {
      this.body = value;
    },
  };
  await quotePdfHandler({
    method: "GET",
    headers: {},
    query: { quote_id: "quote_1" },
  }, response);

  assert.equal(response.statusCode, 401);
  assert.match(response.headers["cache-control"], /no-store/);
  assert.equal(JSON.parse(response.body).code, "unauthorized");
});
