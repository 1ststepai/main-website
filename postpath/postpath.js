const channels = [...document.querySelectorAll(".account")];
const runBtn = document.getElementById("run-demo");
const result = document.getElementById("result");
const timeline = document.getElementById("timeline");
const promptEl = document.getElementById("prompt");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

channels.forEach((button) => {
  button.addEventListener("click", () => {
    button.classList.toggle("active");
    button.setAttribute("aria-pressed", button.classList.contains("active") ? "true" : "false");
  });
});

function sleep(ms) {
  if (reduceMotion) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setStep(name, state) {
  const row = timeline?.querySelector(`[data-step="${name}"]`);
  if (!row) return;
  row.classList.remove("on", "run");
  if (state) row.classList.add(state);
}

async function runDemo() {
  const chosen = channels.filter((b) => b.classList.contains("active")).map((b) => b.dataset.channel);
  const prompt = String(promptEl?.value || "").trim();
  result.classList.remove("show");
  result.textContent = "";

  if (!chosen.length) {
    result.classList.add("show");
    result.textContent = "Select at least one channel to preview your workflow.";
    return;
  }
  if (!prompt) {
    result.classList.add("show");
    result.textContent = "Add a prompt to preview your workflow.";
    return;
  }

  runBtn.disabled = true;
  timeline.hidden = false;
  ["connect", "draft", "review", "schedule"].forEach((step) => setStep(step, null));

  setStep("connect", "run");
  await sleep(500);
  setStep("connect", "on");

  setStep("draft", "run");
  await sleep(650);
  setStep("draft", "on");

  setStep("review", "run");
  await sleep(700);
  setStep("review", "on");

  setStep("schedule", "run");
  await sleep(500);
  setStep("schedule", "on");

  const handoff = chosen.includes("TikTok") ? " TikTok, if chosen, stays an inbox handoff." : "";
  result.classList.add("show");
  result.textContent = [
    "SIMULATED PREVIEW",
    "",
    `1. Prompt: “${prompt}”`,
    `2. Draft would be aimed at: ${chosen.join(", ")}.${handoff}`,
    "3. You would review it, then it could sit on a local schedule.",
    "",
    "Simulated only. Nothing was sent.",
  ].join("\n");

  runBtn.disabled = false;
}

runBtn?.addEventListener("click", () => {
  runDemo().catch(() => {
    runBtn.disabled = false;
    result.classList.add("show");
    result.textContent = "Demo hit a snag. Refresh and try again.";
  });
});

document.getElementById("access-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim();
  const need = String(data.get("need") || "").trim() || "Early access";
  const subject = encodeURIComponent(`PostPath early access — ${name}`);
  const body = encodeURIComponent(
    `Name: ${name}\nEmail: ${email}\nNeed: ${need}\n\nSource: postpath.1ststep.ai`,
  );
  const note = document.getElementById("access-note");
  if (note) {
    note.textContent = "Email draft opened. Send it to request early access. We reply from 1stStep.ai.";
  }
  if (typeof window.fsaiTrack === "function") {
    window.fsaiTrack("postpath_early_access_click", { placement: "access_form" });
  }
  const submitButton = form.querySelector("button[type=submit]");
  if (submitButton) submitButton.disabled = true;
  window.location.href = `mailto:evan@1ststep.ai?subject=${subject}&body=${body}`;
});
