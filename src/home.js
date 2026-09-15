import './os-story.js';
import './site-motion.js';

const auditForm = document.querySelector('#home-audit-form');
if (auditForm) {
  const targetInput = auditForm.elements.target;
  const status = auditForm.querySelector('#home-audit-status');
  const submit = auditForm.querySelector('button[type="submit"]');
  const sourceCopy = {
    website: { placeholder: 'https://yourwebsite.com', scope: 'We inspect one public HTML response. No private pages or accounts.' },
    web_app: { placeholder: 'https://app.yourcompany.com', scope: 'We inspect the public app surface only. Authenticated behavior remains unverified.' },
    github: { placeholder: 'https://github.com/you/project', scope: 'We inspect public repository metadata. Private code and repositories are not accessed.' },
    mobile_app: { placeholder: 'https://apps.apple.com/app/... or https://play.google.com/store/apps/details?id=...', scope: 'We inspect the public App Store or Google Play listing. The installed app remains unverified.' },
  };
  const updateAuditType = () => {
    const type = auditForm.elements.source_type.value;
    targetInput.placeholder = sourceCopy[type].placeholder;
    document.querySelector('#home-audit-scope').textContent = sourceCopy[type].scope;
  };
  auditForm.addEventListener('change', (event) => { if (event.target.name === 'source_type') updateAuditType(); });
  auditForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!auditForm.reportValidity()) return;
    const requestId = crypto.randomUUID();
    const sourceType = auditForm.elements.source_type.value;
    submit.disabled = true;
    status.dataset.state = '';
    status.textContent = 'Saving your request securely…';
    try {
      const response = await fetch('/api/os-roast-intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestId, email: auditForm.elements.email.value, target: targetInput.value, source_type: sourceType, consent: auditForm.elements.consent.checked, marketing_opt_in: false, attribution: window.fsaiAttribution?.get?.() || {} }), signal: AbortSignal.timeout(10000) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.persisted) throw new Error(payload.message || 'We could not save your request. No scan ran.');
      sessionStorage.setItem('fsai_first_look_handoff', JSON.stringify({ version: 1, email: auditForm.elements.email.value.trim(), target: targetInput.value.trim(), source_type: sourceType, receipt: payload.request_id }));
      window.fsaiTrack?.('home_audit_request_persisted', { source_type: sourceType });
      status.textContent = 'Saved. Opening your live audit…';
      location.assign('/os/start/');
    } catch (error) {
      status.dataset.state = 'error';
      status.textContent = error.name === 'TimeoutError' ? 'Saving timed out. No scan ran. Please try again.' : error.message;
      submit.disabled = false;
    }
  });
}

document.documentElement.classList.add('js-ready');
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
