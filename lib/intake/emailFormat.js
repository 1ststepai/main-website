export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function configured() {
  return Boolean(
    process.env.RESEND_API_KEY &&
    process.env.APP_IDEA_NOTIFY_TO &&
    process.env.APP_IDEA_NOTIFY_FROM
  );
}

export function attributionLines(attribution) {
  const entries = Object.entries(attribution || {});
  return entries.length
    ? entries.map(([key, value]) => `${key}: ${value}`).join("\n")
    : "No campaign attribution captured";
}
