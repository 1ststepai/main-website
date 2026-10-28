const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Opening story: CSS-driven; the pause button toggles a class.
document.querySelectorAll("[data-pause-target]").forEach((btn) => {
  const target = document.querySelector(btn.dataset.pauseTarget);
  if (!target) return;
  if (reduceMotion) { btn.hidden = true; return; }
  btn.addEventListener("click", () => {
    const paused = target.classList.toggle("paused");
    btn.setAttribute("aria-pressed", String(paused));
    btn.textContent = paused ? "Play animation" : "Pause animation";
  });
});

// Demo: five looping frames, also controllable as tabs.
const demo = document.querySelector("[data-demo]");
if (demo) {
  const tabs = [...demo.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
  const pauseBtn = demo.querySelector("[data-demo-pause]");
  let index = 0;
  let timer = null;

  const show = (i, focus = false) => {
    index = (i + tabs.length) % tabs.length;
    tabs.forEach((tab, n) => {
      const on = n === index;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[n].hidden = !on;
    });
    if (focus) tabs[index].focus();
  };
  const stop = () => { clearInterval(timer); timer = null; if (pauseBtn) { pauseBtn.textContent = "Play demo"; pauseBtn.setAttribute("aria-pressed", "true"); } };
  const start = () => { stop(); timer = setInterval(() => show(index + 1), 3800); if (pauseBtn) { pauseBtn.textContent = "Pause demo"; pauseBtn.setAttribute("aria-pressed", "false"); } };

  tabs.forEach((tab, n) => {
    tab.addEventListener("click", () => { stop(); show(n); });
    tab.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); stop(); show(index + 1, true); }
      if (e.key === "ArrowLeft") { e.preventDefault(); stop(); show(index - 1, true); }
    });
  });
  pauseBtn?.addEventListener("click", () => (timer ? stop() : start()));
  show(0);
  if (reduceMotion) stop(); else start();
}

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
  if (note) note.textContent = "Email draft opened. Send it to join early access. We reply from 1stStep.ai.";
  window.location.href = `mailto:evan@1ststep.ai?subject=${subject}&body=${body}`;
});
