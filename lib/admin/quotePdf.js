import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";
import {
  paymentPlanLabel,
  paymentScheduleForQuote,
  safeStripePaymentUrl,
} from "./paymentPlans.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
const COLORS = {
  ink: rgb(0.07, 0.09, 0.16),
  muted: rgb(0.35, 0.39, 0.49),
  line: rgb(0.86, 0.88, 0.92),
  panel: rgb(0.96, 0.97, 0.99),
  accent: rgb(0.34, 0.26, 0.96),
  accentSoft: rgb(0.94, 0.93, 1),
  white: rgb(1, 1, 1),
};

function cleanText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, "?")
    .trim();
}

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function quoteTotal(quote) {
  return (quote.line_items || []).reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0),
    0
  );
}

function formatDate(value) {
  if (!value) return "Not set";
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return cleanText(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function safeFilenamePart(value, fallback) {
  const normalized = cleanText(value)
    .replace(/[^a-zA-Z0-9._ -]+/g, " ")
    .replace(/[.\s_-]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return normalized || fallback;
}

export function quotePdfFilename(quote) {
  const number = safeFilenamePart(quote?.quote_number, "Quote");
  const project = safeFilenamePart(quote?.project_title, "Project");
  return `1stStep-${number}-${project}.pdf`;
}

function wrapText(text, font, size, maximumWidth) {
  const lines = [];
  for (const paragraph of cleanText(text).split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maximumWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maximumWidth) {
        current = word;
        continue;
      }
      let fragment = "";
      for (const character of word) {
        const candidateFragment = fragment + character;
        if (font.widthOfTextAtSize(candidateFragment, size) > maximumWidth && fragment) {
          lines.push(fragment);
          fragment = character;
        } else {
          fragment = candidateFragment;
        }
      }
      current = fragment;
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawLines(page, lines, {
  font,
  size,
  x,
  y,
  color = COLORS.ink,
  lineHeight = size * 1.35,
}) {
  lines.forEach((line, index) => {
    if (line) page.drawText(line, {
      x,
      y: y - (index * lineHeight),
      size,
      font,
      color,
    });
  });
  return y - (lines.length * lineHeight);
}

function drawDocumentHeader(page, fonts, eyebrow, title) {
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 112,
    width: PAGE_WIDTH,
    height: 112,
    color: COLORS.ink,
  });
  page.drawText("1stStep", {
    x: MARGIN,
    y: PAGE_HEIGHT - 48,
    size: 22,
    font: fonts.bold,
    color: COLORS.white,
  });
  page.drawText(".ai", {
    x: MARGIN + fonts.bold.widthOfTextAtSize("1stStep", 22),
    y: PAGE_HEIGHT - 48,
    size: 22,
    font: fonts.bold,
    color: rgb(0.55, 0.48, 1),
  });
  page.drawText(cleanText(eyebrow).toUpperCase(), {
    x: MARGIN,
    y: PAGE_HEIGHT - 73,
    size: 8,
    font: fonts.bold,
    color: rgb(0.62, 0.66, 0.76),
    characterSpacing: 1.2,
  });
  page.drawText(cleanText(title).slice(0, 72), {
    x: MARGIN,
    y: PAGE_HEIGHT - 98,
    size: 15,
    font: fonts.bold,
    color: COLORS.white,
  });
}

function drawPageFooter(page, fonts, pageNumber, pageCount, quoteNumber) {
  page.drawLine({
    start: { x: MARGIN, y: 34 },
    end: { x: PAGE_WIDTH - MARGIN, y: 34 },
    thickness: 0.7,
    color: COLORS.line,
  });
  page.drawText(`1stStep.ai  |  ${cleanText(quoteNumber)}`, {
    x: MARGIN,
    y: 20,
    size: 7.5,
    font: fonts.regular,
    color: COLORS.muted,
  });
  const label = `Page ${pageNumber} of ${pageCount}`;
  page.drawText(label, {
    x: PAGE_WIDTH - MARGIN - fonts.regular.widthOfTextAtSize(label, 7.5),
    y: 20,
    size: 7.5,
    font: fonts.regular,
    color: COLORS.muted,
  });
}

function drawLabel(page, fonts, label, x, y) {
  page.drawText(cleanText(label).toUpperCase(), {
    x,
    y,
    size: 7.5,
    font: fonts.bold,
    color: COLORS.muted,
    characterSpacing: 0.8,
  });
}

function addTextField(form, page, fonts, name, label, x, y, width, height = 28) {
  drawLabel(page, fonts, label, x, y + height + 7);
  const field = form.createTextField(name);
  field.addToPage(page, {
    x,
    y,
    width,
    height,
    font: fonts.regular,
    textColor: COLORS.ink,
    backgroundColor: COLORS.white,
    borderColor: rgb(0.60, 0.63, 0.72),
    borderWidth: 1,
  });
  field.setFontSize(10);
  return field;
}

function drawPreparedFor(page, fonts, client, quote) {
  const top = PAGE_HEIGHT - 145;
  const columnWidth = 244;
  drawLabel(page, fonts, "Prepared for", MARGIN, top);
  page.drawText(cleanText(client.company || client.contact_name || "Client"), {
    x: MARGIN,
    y: top - 22,
    size: 15,
    font: fonts.bold,
    color: COLORS.ink,
    maxWidth: columnWidth,
  });
  const clientLines = [
    client.contact_name,
    client.email,
    client.phone,
    client.billing_address,
  ].filter(Boolean).flatMap((line) => wrapText(line, fonts.regular, 9, columnWidth));
  drawLines(page, clientLines.slice(0, 7), {
    font: fonts.regular,
    size: 9,
    x: MARGIN,
    y: top - 42,
    color: COLORS.muted,
    lineHeight: 13,
  });

  const rightX = PAGE_WIDTH / 2 + 18;
  drawLabel(page, fonts, "Quote details", rightX, top);
  const details = [
    ["Quote", quote.quote_number || "Draft"],
    ["Issued", formatDate(quote.created_at)],
    ["Valid until", formatDate(quote.valid_until)],
  ];
  details.forEach(([label, value], index) => {
    const y = top - 21 - (index * 20);
    page.drawText(label, {
      x: rightX,
      y,
      size: 8.5,
      font: fonts.regular,
      color: COLORS.muted,
    });
    page.drawText(cleanText(value), {
      x: rightX + 72,
      y,
      size: 8.5,
      font: fonts.bold,
      color: COLORS.ink,
    });
  });
}

function addContentPage(document, fonts, eyebrow, title) {
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawDocumentHeader(page, fonts, eyebrow, title);
  return page;
}

function drawScopeAndPricing(document, fonts, quote, client) {
  let page = addContentPage(
    document,
    fonts,
    quote.document_depth === "essential" ? "Estimate" : "Proposal and agreement",
    quote.project_title || "Project quote"
  );
  drawPreparedFor(page, fonts, client, quote);

  let y = PAGE_HEIGHT - 270;
  if (quote.summary) {
    const summaryLines = wrapText(quote.summary, fonts.regular, 9.5, CONTENT_WIDTH - 32);
    const summaryHeight = 38 + (summaryLines.length * 13);
    page.drawRectangle({
      x: MARGIN,
      y: y - summaryHeight + 12,
      width: CONTENT_WIDTH,
      height: summaryHeight,
      color: COLORS.accentSoft,
      borderColor: rgb(0.84, 0.81, 1),
      borderWidth: 0.7,
    });
    drawLabel(page, fonts, "Project summary", MARGIN + 16, y - 4);
    drawLines(page, summaryLines, {
      font: fonts.regular,
      size: 9.5,
      x: MARGIN + 16,
      y: y - 24,
      color: COLORS.ink,
      lineHeight: 13,
    });
    y -= summaryHeight + 14;
  }
  if (y < 150) {
    page = addContentPage(document, fonts, "Scope and pricing", quote.project_title || "Project quote");
    y = PAGE_HEIGHT - 145;
  }

  page.drawText("Scope and pricing", {
    x: MARGIN,
    y,
    size: 15,
    font: fonts.bold,
    color: COLORS.ink,
  });
  y -= 26;

  for (const item of quote.line_items || []) {
    const description = wrapText(item.description, fonts.regular, 8.5, 350);
    const rowHeight = Math.max(44, 28 + (description.length * 11));
    if (y - rowHeight < 92) {
      page = addContentPage(document, fonts, "Scope and pricing", quote.project_title || "Project quote");
      y = PAGE_HEIGHT - 145;
    }
    page.drawLine({
      start: { x: MARGIN, y: y + 5 },
      end: { x: PAGE_WIDTH - MARGIN, y: y + 5 },
      thickness: 0.7,
      color: COLORS.line,
    });
    page.drawText(cleanText(item.name || "Service"), {
      x: MARGIN,
      y: y - 13,
      size: 10,
      font: fonts.bold,
      color: COLORS.ink,
    });
    drawLines(page, description, {
      font: fonts.regular,
      size: 8.5,
      x: MARGIN,
      y: y - 28,
      color: COLORS.muted,
      lineHeight: 11,
    });
    const amount = currency(Number(item.quantity || 0) * Number(item.rate || 0));
    page.drawText(amount, {
      x: PAGE_WIDTH - MARGIN - fonts.bold.widthOfTextAtSize(amount, 10),
      y: y - 13,
      size: 10,
      font: fonts.bold,
      color: COLORS.ink,
    });
    y -= rowHeight;
  }

  const schedule = paymentScheduleForQuote(quote);
  const pricingHeight = 70 + (schedule.length * 25);
  if (y - pricingHeight < 92) {
    page = addContentPage(document, fonts, "Payment schedule", quote.project_title || "Project quote");
    y = PAGE_HEIGHT - 145;
  }
  page.drawRectangle({
    x: PAGE_WIDTH - MARGIN - 300,
    y: y - pricingHeight + 8,
    width: 300,
    height: pricingHeight,
    color: COLORS.panel,
    borderColor: COLORS.line,
    borderWidth: 0.7,
  });
  page.drawText("Total", {
    x: PAGE_WIDTH - MARGIN - 282,
    y: y - 17,
    size: 10,
    font: fonts.regular,
    color: COLORS.muted,
  });
  const total = currency(quoteTotal(quote));
  page.drawText(total, {
    x: PAGE_WIDTH - MARGIN - 18 - fonts.bold.widthOfTextAtSize(total, 15),
    y: y - 20,
    size: 15,
    font: fonts.bold,
    color: COLORS.ink,
  });
  page.drawText(paymentPlanLabel(quote.payment_plan), {
    x: PAGE_WIDTH - MARGIN - 282,
    y: y - 39,
    size: 8,
    font: fonts.bold,
    color: COLORS.accent,
  });
  schedule.forEach((installment, index) => {
    const rowY = y - 62 - (index * 25);
    const label = `${installment.label} - ${installment.due}`;
    page.drawText(cleanText(label).slice(0, 62), {
      x: PAGE_WIDTH - MARGIN - 282,
      y: rowY,
      size: 7.8,
      font: fonts.regular,
      color: COLORS.muted,
    });
    const amount = currency(installment.amount);
    page.drawText(amount, {
      x: PAGE_WIDTH - MARGIN - 18 - fonts.bold.widthOfTextAtSize(amount, 8.5),
      y: rowY,
      size: 8.5,
      font: fonts.bold,
      color: COLORS.ink,
    });
  });
}

function drawAgreementTerms(document, fonts, quote) {
  let page = addContentPage(document, fonts, "Agreement", "Project terms");
  let y = PAGE_HEIGHT - 148;
  const enabledSections = (quote.contract_sections || []).filter((section) => section.enabled);

  enabledSections.forEach((section, index) => {
    const title = `${index + 1}. ${cleanText(section.title || "Term")}`;
    let bodyLines = wrapText(section.body, fonts.regular, 8.6, CONTENT_WIDTH);
    if (!bodyLines.length) bodyLines = [""];
    if (y < 115) {
      page = addContentPage(document, fonts, "Agreement", "Project terms");
      y = PAGE_HEIGHT - 148;
    }
    let continued = false;
    while (bodyLines.length) {
      const sectionTitle = continued ? `${title} (continued)` : title;
      page.drawText(sectionTitle, {
        x: MARGIN,
        y,
        size: 10.5,
        font: fonts.bold,
        color: COLORS.ink,
      });
      const availableLines = Math.max(1, Math.floor((y - 87) / 11.5));
      const pageLines = bodyLines.slice(0, availableLines);
      bodyLines = bodyLines.slice(availableLines);
      y = drawLines(page, pageLines, {
        font: fonts.regular,
        size: 8.6,
        x: MARGIN,
        y: y - 17,
        color: COLORS.muted,
        lineHeight: 11.5,
      }) - 13;
      if (bodyLines.length) {
        page = addContentPage(document, fonts, "Agreement", "Project terms");
        y = PAGE_HEIGHT - 148;
        continued = true;
      }
    }
  });

  if (quote.notes) {
    const noteLines = wrapText(quote.notes, fonts.regular, 8.6, CONTENT_WIDTH - 24);
    const noteHeight = 32 + (noteLines.length * 11.5);
    if (y - noteHeight < 70) {
      page = addContentPage(document, fonts, "Agreement", "Project notes");
      y = PAGE_HEIGHT - 148;
    }
    page.drawRectangle({
      x: MARGIN,
      y: y - noteHeight + 8,
      width: CONTENT_WIDTH,
      height: noteHeight,
      color: COLORS.panel,
      borderColor: COLORS.line,
      borderWidth: 0.7,
    });
    drawLabel(page, fonts, "Project notes", MARGIN + 12, y - 12);
    drawLines(page, noteLines, {
      font: fonts.regular,
      size: 8.6,
      x: MARGIN + 12,
      y: y - 31,
      color: COLORS.ink,
      lineHeight: 11.5,
    });
  }
}

function drawElectronicAcceptance(document, fonts, form, quote, client) {
  const page = addContentPage(document, fonts, "Electronic acceptance", "Review, type your name, and sign");
  const top = PAGE_HEIGHT - 148;
  page.drawText("How to accept this agreement", {
    x: MARGIN,
    y: top,
    size: 16,
    font: fonts.bold,
    color: COLORS.ink,
  });
  const instructions = wrapText(
    "Type your full legal name, title, signature, and date below. Check the acceptance box, save this PDF, and reply to the email that delivered it. Your typed signature confirms that you reviewed and accept the scope, pricing, payment schedule, and agreement terms in this document.",
    fonts.regular,
    9.5,
    CONTENT_WIDTH
  );
  drawLines(page, instructions, {
    font: fonts.regular,
    size: 9.5,
    x: MARGIN,
    y: top - 25,
    color: COLORS.muted,
    lineHeight: 14,
  });

  page.drawRectangle({
    x: MARGIN,
    y: 323,
    width: CONTENT_WIDTH,
    height: 255,
    color: COLORS.panel,
    borderColor: COLORS.line,
    borderWidth: 0.8,
  });
  drawLabel(page, fonts, "Client acceptance", MARGIN + 18, 552);
  page.drawText(cleanText(client.company || client.contact_name || "Client"), {
    x: MARGIN + 18,
    y: 530,
    size: 11,
    font: fonts.bold,
    color: COLORS.ink,
  });
  addTextField(form, page, fonts, "client_legal_name", "Full legal name", MARGIN + 18, 469, 230);
  addTextField(form, page, fonts, "client_title", "Title / role", MARGIN + 268, 469, 230);
  addTextField(form, page, fonts, "client_signature", "Electronic signature - type full name", MARGIN + 18, 402, 315, 31);
  addTextField(form, page, fonts, "client_signature_date", "Date signed", MARGIN + 353, 402, 145, 31);

  const checkbox = form.createCheckBox("client_acceptance");
  checkbox.addToPage(page, {
    x: MARGIN + 18,
    y: 348,
    width: 16,
    height: 16,
    borderColor: COLORS.accent,
    borderWidth: 1,
    backgroundColor: COLORS.white,
  });
  const consent = wrapText(
    `I have reviewed and accept quote ${quote.quote_number || ""}, including its scope, pricing, payment schedule, and agreement terms.`,
    fonts.regular,
    8.5,
    CONTENT_WIDTH - 62
  );
  drawLines(page, consent, {
    font: fonts.regular,
    size: 8.5,
    x: MARGIN + 44,
    y: 359,
    color: COLORS.ink,
    lineHeight: 11,
  });

  drawLabel(page, fonts, "1stStep.ai acceptance", MARGIN, 283);
  addTextField(form, page, fonts, "firststep_signature", "Authorized signature", MARGIN, 218, 330, 31);
  addTextField(form, page, fonts, "firststep_signature_date", "Date signed", MARGIN + 350, 218, 166, 31);
  page.drawText("Electronic acceptance records the names and dates entered in this PDF. It does not provide independent identity verification or a third-party audit trail.", {
    x: MARGIN,
    y: 176,
    size: 7.4,
    font: fonts.regular,
    color: COLORS.muted,
    maxWidth: CONTENT_WIDTH,
  });
  page.drawText("Return the completed PDF to evan@1ststep.ai.", {
    x: MARGIN,
    y: 150,
    size: 9,
    font: fonts.bold,
    color: COLORS.accent,
  });
}

export async function generateQuotePdf({ quote, client }) {
  if (!quote || !client) throw new Error("Quote and client are required");
  const document = await PDFDocument.create();
  document.setTitle(`${cleanText(quote.quote_number)} - ${cleanText(quote.project_title)}`);
  document.setAuthor("1stStep.ai");
  document.setCreator("1stStep.ai Admin Studio");
  document.setProducer("1stStep.ai");
  document.setSubject("Client proposal and agreement with electronic acceptance fields");
  document.setCreationDate(new Date());
  document.setModificationDate(new Date());

  const fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
  };
  const form = document.getForm();

  drawScopeAndPricing(document, fonts, quote, client);
  drawAgreementTerms(document, fonts, quote);
  drawElectronicAcceptance(document, fonts, form, quote, client);

  form.updateFieldAppearances(fonts.regular);
  const pages = document.getPages();
  pages.forEach((page, index) => {
    drawPageFooter(page, fonts, index + 1, pages.length, quote.quote_number || "Quote");
  });

  return document.save({
    useObjectStreams: false,
    addDefaultPage: false,
    updateFieldAppearances: true,
  });
}
