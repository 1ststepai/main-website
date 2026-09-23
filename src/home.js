const hero = document.querySelector('.hero');
const paths = {
  build_new: ['Build Something New', 'YOUR NEXT PRODUCT', 'TO PRODUCT.', ['Idea', 'Architecture', 'UI', 'Backend', 'Verify', 'Live product']],
  finish_build: ['Finish My Build', 'YOUR EXISTING BUILD', 'TO RELEASE.', ['Existing build', 'Inspect', 'Find gaps', 'Repair', 'Harden', 'Deploy']],
  automate_business: ['Automate My Business', 'YOUR BUSINESS SYSTEM', 'TO FLOW.', ['Manual work', 'Map process', 'Connect systems', 'Automate', 'Human control', 'Operating system']],
};
const choices = [...document.querySelectorAll('[data-path-choice]')];
choices.forEach((button, index) => {
  button.hidden = false;
  button.addEventListener('click', () => {
    const key = button.dataset.pathChoice;
    const [label, kicker, result, steps] = paths[key];
    hero.dataset.path = key;
    choices.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    document.querySelector('#scene-kicker').textContent = kicker;
    document.querySelector('#scene-result').textContent = result;
    document.querySelectorAll('.scene-steps li').forEach((item, i) => { item.textContent = steps[i]; });
    const cta = document.querySelector('#hero-cta');
    const destination = `/fit-check/?intent=${key}`;
    cta.href = window.fsaiAttribution?.appendToUrl(destination) || destination;
    cta.dataset.fsaiIntent = key;
    cta.replaceChildren(document.createTextNode(`${label} `));
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    cta.append(arrow);
  });
  button.addEventListener('keydown', event => {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!offset) return;
    event.preventDefault();
    const next = choices[(index + offset + choices.length) % choices.length];
    next.focus(); next.click();
  });
});
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)');
const toggle = document.querySelector('.motion-toggle');
const stack = document.querySelector('.scene-stack');
const product = document.querySelector('[data-product-stage]');
let paused = false;
let productVisible = false;
let frame = 0;
let pointer = null;
function renderMotion() {
  frame = 0;
  if (paused || reduced.matches || document.hidden) return;
  // Read geometry before writing transforms; no perpetual animation loop.
  const rect = productVisible ? product.getBoundingClientRect() : null;
  if (pointer && finePointer.matches && innerWidth > 700) {
    stack.style.setProperty('--rx', `${pointer.y * -4}deg`);
    stack.style.setProperty('--ry', `${pointer.x * 5}deg`);
  }
  if (rect && innerWidth > 700) {
    const progress = Math.max(-1, Math.min(1, (rect.top + rect.height / 2 - innerHeight / 2) / innerHeight));
    product.style.setProperty('--tilt', `${progress * 8}deg`);
    product.style.setProperty('--lift', `${progress * 16}px`);
  }
}
function schedule() { if (!frame && !paused && !reduced.matches) frame = requestAnimationFrame(renderMotion); }
hero.addEventListener('pointermove', event => {
  if (!finePointer.matches || paused || reduced.matches) return;
  const rect = hero.getBoundingClientRect();
  pointer = { x: (event.clientX - rect.left) / rect.width - .5, y: (event.clientY - rect.top) / rect.height - .5 };
  schedule();
}, { passive: true });
hero.addEventListener('pointerleave', () => { pointer = { x: 0, y: 0 }; schedule(); });
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => { productVisible = entry.isIntersecting; schedule(); }).observe(product);
} else productVisible = true;
window.addEventListener('scroll', () => { if (productVisible) schedule(); }, { passive: true });
function resetMotion() {
  stack.style.removeProperty('--rx'); stack.style.removeProperty('--ry');
  product.style.removeProperty('--tilt'); product.style.removeProperty('--lift');
}
 toggle.hidden = reduced.matches;
toggle.addEventListener('click', () => {
  paused = !paused;
  document.body.classList.toggle('motion-paused', paused);
  toggle.setAttribute('aria-pressed', String(paused));
  toggle.textContent = paused ? 'Resume motion' : 'Pause motion';
  resetMotion(); schedule();
});
reduced.addEventListener('change', () => { toggle.hidden = reduced.matches; resetMotion(); schedule(); });
const stages = [
  ['Request', 'Start with the outcome.', 'Choose “Next stage” to assemble the example.'],
  ['Research / context', 'Know the starting point.', 'Example: inspect the current workflow, inputs, and constraints.'],
  ['Architecture', 'Connect the right parts.', 'Example: map data, permissions, integrations, and human control.'],
  ['Build workstreams', 'One connected system.', 'Example: UI, database, auth, automation, integrations, and analytics assemble together.'],
  ['Verify', 'Evidence before release.', 'Example review gates: tests, security, failure paths, and human review. No checks run here.'],
  ['Launch', 'A deliberate release.', 'Example: an approved deployment with monitoring and a rollback point. Nothing is deployed here.'],
  ['Handoff ready', 'System ready. Owner in control.', 'Illustrated end state: verified system and handoff prepared. This is a demonstration, not a completed build.'],
];
let step = 0;
const next = document.querySelector('#machine-next');
const reset = document.querySelector('#machine-reset');
function showStage() {
  document.querySelector('.build-machine').dataset.step = String(step);
  document.querySelector('#machine-phase').textContent = `0${step + 1} / ${stages[step][0]}`;
  document.querySelector('#machine-output').textContent = stages[step][1];
  document.querySelector('#machine-detail').textContent = stages[step][2];
  document.querySelectorAll('.machine-rail li').forEach((item, i) => {
    if (i === step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
  });
  next.textContent = step === stages.length - 1 ? 'Replay example ↻' : 'Next stage →';
}
next.hidden = reset.hidden = false;
next.addEventListener('click', () => { step = (step + 1) % stages.length; showStage(); });
reset.addEventListener('click', () => { step = 0; showStage(); });
