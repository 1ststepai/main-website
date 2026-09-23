const form = document.querySelector("#intake-form");
const status = document.querySelector("#form-status");
const submit = form?.querySelector("button[type='submit']");
const categoryField = document.querySelector("[data-category-field]");
const category = document.querySelector("#build-category");
const successPanel = document.querySelector("#success-panel");
const requestReference = document.querySelector("#request-reference");
let idempotencyKey = crypto.randomUUID();
let started = false;

const allowedIntents = new Set(["build_new", "finish_build", "automate_business"]);
const params = new URLSearchParams(location.search);
const requestedIntent = params.get("intent");
if (allowedIntents.has(requestedIntent)) form?.querySelector(`[name="intent"][value="${requestedIntent}"]`)?.click();

function syncIntent() {
  const intent = form?.elements.intent?.value;
  const needsCategory = intent === "build_new";
  categoryField.hidden = !needsCategory;
  category.required = needsCategory;
  if (!needsCategory) category.value = "";
}
syncIntent();
form?.addEventListener("change", (event) => { if (event.target.name === "intent") syncIntent(); idempotencyKey = crypto.randomUUID(); });
form?.addEventListener("input", () => {
  idempotencyKey = crypto.randomUUID();
  if (!started) { started = true; window.fsaiTrack?.("commercial_intake_start", { intent: form.elements.intent?.value || "unselected" }); }
});

function attribution() { return window.fsaiAttribution?.get?.() || {}; }
function payloadFromForm() {
  const data = new FormData(form);
  return {
    intent: data.get("intent"), build_category: data.get("build_category"), desired_result: data.get("desired_result"),
    current_stage: data.get("current_stage"), project_url: data.get("project_url"), what_exists: data.get("what_exists"),
    current_tools: data.get("current_tools"), biggest_blocker: data.get("biggest_blocker"), deadline: data.get("deadline"), budget_range: data.get("budget_range"),
    email: data.get("email"), consent: data.get("consent") === "on", attribution: attribution(),
  };
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.removeAttribute("data-state"); status.textContent = "";
  if (!form.reportValidity()) return;
  submit.disabled = true; submit.textContent = "Sending…";
  const payload = payloadFromForm();
  try {
    const response = await fetch("/api/commercial-intake", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || !result.accepted) throw new Error(result.message || "Your request could not be sent. Your answers are still here; please retry or use email.");
    form.hidden = true; successPanel.hidden = false; requestReference.textContent = result.request_id || "Reference unavailable";
    window.fsaiTrack?.("commercial_intake_accepted", { intent: payload.intent });
    successPanel.focus?.();
  } catch (error) {
    status.dataset.state = "error"; status.textContent = error.message || "Your request could not be sent. Your answers are still here; please retry or use email.";
    window.fsaiTrack?.("commercial_intake_error", { intent: payload.intent || "unselected" });
  } finally { submit.disabled = false; submit.innerHTML = "Send My Project Request <span aria-hidden=\"true\">→</span>"; }
});
