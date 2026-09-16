export function renderCommercialConfig(root = document) {
  const audit = window.FSAI_COMMERCIAL_CONFIG?.aiOperationsAudit;
  if (!audit?.enabled) return;
  root.querySelectorAll('[data-ai-audit-price]').forEach((node) => { node.textContent = audit.priceDisplay; });
  root.querySelectorAll('[data-ai-audit-credit]').forEach((node) => { node.textContent = audit.creditDisplay; });
}
