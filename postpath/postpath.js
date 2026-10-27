const channels = [...document.querySelectorAll(".channel")];
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
  ["connect", "create", "distribute", "review"].forEach((step) => setStep(step, null));

  setStep("connect", "run");
  await sleep(500);
  setStep("connect", "on");

  setStep("create", "run");
  await sleep(650);
  setStep("create", "on");

  setStep("distribute", "run");
  await sleep(700);
  setStep("distribute", "on");

  setStep("review", "run");
  await sleep(500);
  setStep("review", "on");

  result.classList.add("show");
  result.textContent = [
    "WORKFLOW PREVIEW",
    "",
    `1. Your AI receives: “${prompt}”`,
    `2. PostPath routes drafts toward: ${chosen.join(", ")}.`,
    "3. You review before any intended publishing action.",
    "",
    "Simulation only — nothing was sent or published.",
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
  const data = new FormData(event.currentTarget);
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim();
  const need = String(data.get("need") || "").trim() || "Early access";
  const subject = encodeURIComponent(`PostPath early access — ${name}`);
  const body = encodeURIComponent(
    `Name: ${name}\nEmail: ${email}\nNeed: ${need}\n\nSource: postpath.1ststep.ai`,
  );
  const note = document.getElementById("access-note");
  if (note) note.textContent = "Email draft opened. Send it to join early access—we reply from 1stStep.ai.";
  window.location.href = `mailto:evan@1ststep.ai?subject=${subject}&body=${body}`;
});
