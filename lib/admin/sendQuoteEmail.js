import { fetchWithTimeout } from "../http/fetchWithTimeout.js";

export const ADMIN_EMAIL_FROM = "Evan at 1stStep.ai <evan@1ststep.ai>";
export const ADMIN_EMAIL_REPLY_TO = "evan@1ststep.ai";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function quoteTotal(quote) {
  return quote.line_items.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0),
    0
  );
}

function safeSubject(value) {
  return String(value || "Project quote").replace(/[\r\n]+/g, " ").trim().slice(0, 140);
}

function recipientEmail(client) {
  const email = String(client.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("Add a valid client email before sending this quote.");
    error.code = "client_email_required";
    error.statusCode = 400;
    throw error;
  }
  return email;
}

export function quoteEmailText({ quote, client, note = "" }) {
  const total = quoteTotal(quote);
  const deposit = total * Number(quote.deposit_percent || 0) / 100;
  const enabledSections = quote.contract_sections.filter((section) => section.enabled);
  return [
    `Hi ${client.contact_name || client.company || "there"},`,
    "",
    note || `Here is the quote for ${quote.project_title || "your project"}.`,
    "",
    `${quote.quote_number} — ${quote.project_title || "Project quote"}`,
    quote.summary,
    "",
    ...quote.line_items.flatMap((item) => [
      `${item.name}: ${currency(Number(item.quantity || 0) * Number(item.rate || 0))}`,
      item.description,
    ]),
    "",
    `Total: ${currency(total)}`,
    `${quote.deposit_percent}% deposit due on approval: ${currency(deposit)}`,
    `Remaining balance: ${currency(total - deposit)}`,
    "",
    "Agreement structure",
    ...enabledSections.flatMap((section, index) => [
      `${index + 1}. ${section.title}`,
      section.body,
      "",
    ]),
    "Reply to this email with any questions or requested changes.",
    "",
    "Evan",
    "1stStep.ai",
    ADMIN_EMAIL_REPLY_TO,
  ].filter((line) => line !== undefined && line !== null).join("\n");
}

export function quoteEmailHtml({ quote, client, note = "" }) {
  const total = quoteTotal(quote);
  const deposit = total * Number(quote.deposit_percent || 0) / 100;
  const enabledSections = quote.contract_sections.filter((section) => section.enabled);
  const rows = quote.line_items.map((item) => `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #e7e9f0;vertical-align:top">
        <strong style="display:block;color:#12172a;font-size:14px">${escapeHtml(item.name)}</strong>
        <span style="display:block;margin-top:4px;color:#687087;font-size:12px;line-height:1.5">${escapeHtml(item.description)}</span>
      </td>
      <td style="padding:16px 0 16px 14px;border-bottom:1px solid #e7e9f0;color:#12172a;font-size:13px;text-align:right;white-space:nowrap;vertical-align:top">
        ${escapeHtml(currency(Number(item.quantity || 0) * Number(item.rate || 0)))}
      </td>
    </tr>
  `).join("");
  const terms = enabledSections.map((section, index) => `
    <div style="margin:0 0 18px">
      <h3 style="margin:0 0 6px;color:#12172a;font-size:14px">${index + 1}. ${escapeHtml(section.title)}</h3>
      <p style="margin:0;color:#596176;font-size:12px;line-height:1.65">${escapeHtml(section.body)}</p>
    </div>
  `).join("");

  return `<!doctype html>
  <html>
    <body style="margin:0;background:#f4f6fb;font-family:Arial,sans-serif;color:#12172a">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(`${quote.quote_number} from 1stStep.ai`)}</div>
      <div style="padding:36px 16px">
        <div style="max-width:680px;margin:0 auto;overflow:hidden;border:1px solid #e0e4ee;border-radius:18px;background:#ffffff;box-shadow:0 18px 50px rgba(31,38,68,.08)">
          <div style="padding:28px 34px;background:#090b15">
            <div style="color:#ffffff;font-size:21px;font-weight:800;letter-spacing:-.5px">1stStep<span style="color:#8b7cff">.ai</span></div>
            <div style="margin-top:5px;color:#98a2bd;font-size:11px;letter-spacing:1.5px;text-transform:uppercase">Digital product studio</div>
          </div>
          <div style="padding:34px">
            <p style="margin:0 0 14px;font-size:15px">Hi ${escapeHtml(client.contact_name || client.company || "there")},</p>
            <p style="margin:0 0 28px;color:#596176;font-size:14px;line-height:1.7">${escapeHtml(note || `Here is the quote for ${quote.project_title || "your project"}.`)}</p>
            <div style="padding:22px 24px;border-left:4px solid #6d5efc;background:#f7f7ff">
              <div style="color:#7b849a;font-size:10px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase">${escapeHtml(quote.quote_number)}</div>
              <h1 style="margin:7px 0 8px;color:#12172a;font-size:25px;line-height:1.15">${escapeHtml(quote.project_title || "Project quote")}</h1>
              <p style="margin:0;color:#596176;font-size:13px;line-height:1.65">${escapeHtml(quote.summary)}</p>
              <p style="margin:14px 0 0;color:#7b849a;font-size:11px">Prepared for <strong style="color:#4a5368">${escapeHtml(client.company || client.contact_name || "Client")}</strong></p>
            </div>
            <h2 style="margin:34px 0 9px;font-size:17px">Scope &amp; pricing</h2>
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows}</table>
            <div style="width:310px;max-width:100%;margin:22px 0 30px auto">
              <div style="display:flex;justify-content:space-between;padding:7px 0;color:#596176;font-size:13px"><span>Total</span><strong style="color:#12172a">${escapeHtml(currency(total))}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:7px 0;color:#596176;font-size:13px"><span>${escapeHtml(quote.deposit_percent)}% deposit</span><strong style="color:#12172a">${escapeHtml(currency(deposit))}</strong></div>
              <div style="display:flex;justify-content:space-between;margin-top:6px;padding:13px 0 0;border-top:2px solid #12172a;font-size:13px"><span>Remaining balance</span><strong>${escapeHtml(currency(total - deposit))}</strong></div>
            </div>
            <h2 style="margin:38px 0 20px;padding-top:28px;border-top:2px solid #12172a;font-size:20px">Agreement structure</h2>
            ${terms}
            <div style="margin-top:34px;padding:20px 22px;border-radius:12px;background:#f4f6fb">
              <p style="margin:0;color:#596176;font-size:12px;line-height:1.65">Reply directly to this email with any questions or requested changes. I’ll review them personally.</p>
            </div>
            <p style="margin:28px 0 0;color:#12172a;font-size:14px;line-height:1.6">Evan<br><strong>1stStep.ai</strong><br><a href="mailto:${ADMIN_EMAIL_REPLY_TO}" style="color:#4f73e8">${ADMIN_EMAIL_REPLY_TO}</a></p>
          </div>
        </div>
      </div>
    </body>
  </html>`;
}

export async function sendQuoteEmail({ quote, client, note = "", idempotencyKey }) {
  if (!process.env.RESEND_API_KEY) {
    const error = new Error("Quote email delivery is not configured.");
    error.code = "email_not_configured";
    error.statusCode = 503;
    throw error;
  }
  const recipient = recipientEmail(client);
  const response = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: ADMIN_EMAIL_FROM,
      to: [recipient],
      reply_to: ADMIN_EMAIL_REPLY_TO,
      subject: `Quote ${safeSubject(quote.quote_number)}: ${safeSubject(quote.project_title)} from 1stStep.ai`,
      text: quoteEmailText({ quote, client, note }),
      html: quoteEmailHtml({ quote, client, note }),
    }),
  }, 10000);

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.id) {
    const error = new Error("Resend could not send this quote. Check the sender domain and try again.");
    error.code = response.status === 403 ? "sender_domain_not_verified" : "email_delivery_failed";
    error.statusCode = response.status >= 400 && response.status < 500 ? 422 : 503;
    throw error;
  }
  return { id: String(result.id) };
}
