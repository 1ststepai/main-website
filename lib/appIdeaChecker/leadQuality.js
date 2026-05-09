export function isBudgetAtLeast3000(budget) {
  const normalized = String(budget || "").toLowerCase();
  return (
    normalized.includes("3,000") ||
    normalized.includes("3000") ||
    normalized.includes("10,000") ||
    normalized.includes("10000")
  );
}

export function classifyLeadQuality(score, budget) {
  const numericScore = Number(score);
  if (Number.isFinite(numericScore) && numericScore >= 80 && isBudgetAtLeast3000(budget)) {
    return "high";
  }
  if (Number.isFinite(numericScore) && numericScore >= 60) {
    return "medium";
  }
  return "low";
}
