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
    result.textContent = "Select at least one sample network to preview the simulation.";
    return;
  }
  if (!prompt) {
    result.classList.add("show");
    result.textContent = "Add a few words to preview the simulation.";
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
    "SIMULATED PREVIEW",
    "",
    `1. You wrote: “${prompt}”`,
    `2. Sample networks on screen: ${chosen.join(", ")}. Live publishing is not yet verified.`,
    "3. On the private desk, the post would wait for your approval.",
    "4. The desk is built to show what posted and what failed, including rate-limited and needs review. This preview uses simulated responses.",
    "",
    "Nothing was sent. No real account is connected.",
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
