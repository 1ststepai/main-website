import {
  createQuotePaymentLink,
  deactivateQuotePaymentLink,
} from "../lib/admin/stripePayments.js";
import { paymentScheduleForQuote } from "../lib/admin/paymentPlans.js";
import { loadAdminWorkspace, saveAdminWorkspace } from "../lib/admin/workspaceStore.js";
import {
  guardAdminJsonPost,
  parseAdminJson,
  requireAdminIdentifier,
  sendAdminFailure,
  sendAdminJson,
} from "../lib/admin/adminRequest.js";

const MAX_BODY_BYTES = 8 * 1024;

export default async function handler(req, res) {
  if (!guardAdminJsonPost(req, res)) return;

  let createdLink = null;
  try {
    const body = parseAdminJson(req, MAX_BODY_BYTES);
    const quoteId = requireAdminIdentifier(body.quote_id, "quote_id", 80);
    const idempotencyKey = requireAdminIdentifier(body.idempotency_key, "idempotency_key", 256);
    const installmentNumber = Number(body.installment_number);
    if (!Number.isInteger(installmentNumber) || installmentNumber < 1 || installmentNumber > 4) {
      return sendAdminJson(res, 400, { ok: false, code: "invalid_installment" });
    }

    const workspace = await loadAdminWorkspace();
    const quote = workspace.quotes.find((item) => item.id === quoteId);
    if (!quote) return sendAdminJson(res, 404, { ok: false, code: "quote_not_found" });
    const client = workspace.clients.find((item) => item.id === quote.client_id);
    if (!client) return sendAdminJson(res, 409, { ok: false, code: "client_not_found" });

    const existingLink = (quote.payment_links || []).find(
      (link) => Number(link.installment_number) === installmentNumber
    );
    if (existingLink) {
      const currentInstallment = paymentScheduleForQuote(quote).find(
        (installment) => installment.installment_number === installmentNumber
      );
      if (!currentInstallment || Number(existingLink.amount) !== currentInstallment.amount) {
        return sendAdminJson(res, 409, {
          ok: false,
          code: "payment_link_stale",
          message: "The saved payment link no longer matches this quote. Deactivate it in Stripe before creating a replacement.",
        });
      }
      return sendAdminJson(res, 200, {
        ok: true,
        payment_link: existingLink,
        workspace,
      });
    }

    createdLink = await createQuotePaymentLink({
      quote,
      client,
      installmentNumber,
      idempotencyKey,
    });
    const updated = {
      ...workspace,
      quotes: workspace.quotes.map((item) => item.id === quote.id ? {
        ...item,
        payment_links: [
          ...(item.payment_links || []).filter(
            (link) => Number(link.installment_number) !== installmentNumber
          ),
          createdLink,
        ].sort((left, right) => left.installment_number - right.installment_number),
        updated_at: new Date().toISOString(),
      } : item),
    };
    const saved = await saveAdminWorkspace(updated, workspace.revision);
    console.log(JSON.stringify({
      event: "admin_payment_link_created",
      quote_id: quote.id,
      installment_number: installmentNumber,
      stripe_payment_link_id: createdLink.stripe_payment_link_id,
    }));
    return sendAdminJson(res, 200, {
      ok: true,
      payment_link: createdLink,
      workspace: saved,
    });
  } catch (error) {
    if (createdLink?.stripe_payment_link_id) {
      await deactivateQuotePaymentLink(createdLink.stripe_payment_link_id).catch((deactivateError) => {
        console.error(deactivateError);
      });
    }
    return sendAdminFailure(res, error, "Secure card-link creation is unavailable.", "admin_payment_link_failed");
  }
}
