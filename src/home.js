import './os-story.js';
import './site-motion.js';

document.documentElement.classList.add('js-ready');
const firstLookForm = document.querySelector('.human-route-entry');
firstLookForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = firstLookForm.querySelector('input');
  let normalizeAuditTarget;
  try {
    ({ normalizeAuditTarget } = await import('../os/start/onboarding-state.js'));
  } catch {
    input.setCustomValidity('The first-look form could not load. Use the main button and paste your link there.');
    input.reportValidity();
    return;
  }
  const target = normalizeAuditTarget(input.value);
  if (!target) {
    input.setCustomValidity('Enter a public HTTPS website or GitHub repository link.');
    input.reportValidity();
    return;
  }
  try {
    sessionStorage.setItem('fsai_first_look_handoff', target.url);
  } catch {
    input.setCustomValidity('This browser cannot pass the link to the next page. Use the main button and paste it there.');
    input.reportValidity();
    return;
  }
  window.fsaiTrack?.('os_onboarding_entry_click', { placement: 'home_route_form' });
  window.location.assign('/os/start/');
});
firstLookForm?.querySelector('input')?.addEventListener('input', (event) => event.target.setCustomValidity(''));

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
