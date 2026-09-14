import './os-story.js';

const showcase = document.querySelector("[data-showcase]");
if (showcase) {
  const tabs = Array.from(showcase.querySelectorAll('[role="tab"]'));
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls")));
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let active = 0;
  let paused = false;
  let visible = false;

  function selectProject(index, focus = false) {
    active = (index + tabs.length) % tabs.length;
    tabs.forEach((tab, position) => {
      const selected = position === active;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[position].hidden = !selected;
    });
    if (focus) tabs[active].focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => { paused = true; selectProject(index); });
    tab.addEventListener("keydown", (event) => {
      const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? index + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp" ? index - 1
        : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (next === null) return;
      event.preventDefault();
      paused = true;
      selectProject(next, true);
    });
  });
  showcase.addEventListener("mouseenter", () => { paused = true; });
  showcase.addEventListener("focusin", () => { paused = true; });
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.2 });
    observer.observe(showcase);
  } else visible = true;
  if (!reducedMotion.matches) {
    setInterval(() => {
      if (visible && !paused && !document.hidden && !reducedMotion.matches) selectProject(active + 1);
    }, 9000);
  }
}
