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
  if (paused) document.getAnimations().forEach(animation => animation.cancel());
  toggle.setAttribute('aria-pressed', String(paused));
  toggle.textContent = paused ? 'Resume motion' : 'Pause motion';
  resetMotion(); schedule();
});
reduced.addEventListener('change', () => { toggle.hidden = reduced.matches; if (reduced.matches) document.getAnimations().forEach(animation => animation.cancel()); resetMotion(); schedule(); });
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


// Swap verified captures inside the existing stage; never synthesize product results.
const productScreens = {
  daysetgo: {
    title: 'DaySetGo', description: 'Family planning, made tangible.',
    url: 'https://www.daysetgo.ai/plan?mode=demo', link: 'Explore the demo planner ↗',
    image: '/assets/daysetgo-planner-20260922.webp', width: 1440, height: 1000,
    bar: 'daysetgo.ai / sample planner', state: 'PUBLIC DEMO',
    alt: "DaySetGo's actual public demo planner with family preferences and a sample itinerary; demo data is explicitly unverified.",
    caption: 'Actual public demo interface, captured September 22, 2026. Sample itinerary, prices, and availability are fictionalized or unverified.'
  },
  'job-agent': {
    title: '1stStep Job Agent', description: 'A focused entry into your job search.',
    url: 'https://app.1ststep.ai/concierge', link: 'Open the Job Agent ↗',
    image: '/assets/job-agent-public-entry-20260922.webp', width: 1440, height: 1000,
    bar: 'app.1ststep.ai / concierge', state: 'PUBLIC ENTRY',
    alt: 'Actual Job Agent public entry screen with My Jobs, Needs You, Saved Info, Agent Status, and a Start my Job Agent control. No account data or job results are displayed.',
    caption: 'Current public entry interface, captured September 22, 2026. Starting the workflow requires sign-in. Authenticated search, matching, and application results are not demonstrated here.'
  },
  nova: {
    title: 'SwingTradePros / Nova', description: 'Market education through a focused assistant.',
    url: 'https://swingtradepros.com/ai-assistant-demo', link: 'Explore the public Nova interface ↗',
    image: '/assets/nova-public-gate-20260922.webp', width: 568, height: 621,
    bar: 'swingtradepros.com / Nova', state: 'EMAIL-GATED UI',
    alt: 'Actual Nova public assistant interface showing its email access gate, topic controls, message field, and educational disclaimer. The assistant has not been unlocked.',
    caption: 'Current email-gated assistant interface, captured September 22, 2026. No email was entered and no AI request or trade was made. This is interface evidence, not live analysis or trading performance.'
  }
};
const productChoices = [...document.querySelectorAll('.product-switcher button[data-product]')];
let productLoad = 0;
productChoices.forEach((button, index) => {
  button.hidden = false;
  button.addEventListener('click', async () => {
    const key = button.dataset.product;
    const screen = productScreens[key];
    const version = ++productLoad;
    // Keep the last good image and its matching caption until the next asset decodes.
    product.setAttribute('aria-busy', 'true');
    const image = new Image();
    image.src = screen.image;
    try { await image.decode(); } catch {
      if (version !== productLoad) return;
      product.removeAttribute('aria-busy');
      product.querySelector('figcaption').textContent = 'This screenshot could not load. The existing product links remain available; choose a product to retry.';
      return;
    }
    if (version !== productLoad) return;
    productChoices.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    product.dataset.product = key;
    product.querySelector('h3').textContent = screen.title;
    product.querySelector('.product-caption p').textContent = screen.description;
    const link = product.querySelector('.product-caption a');
    link.href = screen.url; link.textContent = screen.link;
    const surface = product.querySelector('.product-screen');
    surface.href = screen.image;
    surface.setAttribute('aria-label', `Open full-size ${screen.title} screenshot`);
    const picture = surface.querySelector('img');
    picture.src = screen.image; picture.alt = screen.alt;
    picture.width = screen.width; picture.height = screen.height;
    const bars = surface.querySelectorAll('.window-bar span');
    bars[1].textContent = screen.bar; bars[2].textContent = screen.state;
    const caption = product.querySelector('figcaption');
    caption.replaceChildren(document.createTextNode(`${screen.caption} `));
    const fullSize = document.createElement('a');
    fullSize.href = screen.image; fullSize.textContent = 'View full-size ↗';
    fullSize.target = '_blank'; fullSize.rel = 'noopener'; caption.append(fullSize);
    product.removeAttribute('aria-busy');
    if (!paused && !reduced.matches) surface.animate(
      [{ opacity: .2, transform: 'translate3d(0,18px,-100px) rotateX(8deg)' }, { opacity: 1, transform: 'translate3d(0,0,0) rotateX(0)' }],
      { duration: 650, easing: 'cubic-bezier(.2,.7,.2,1)' }
    );
  });
  button.addEventListener('keydown', event => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const target = productChoices[(index + direction + productChoices.length) % productChoices.length];
    target.focus(); target.click();
  });
});
product.querySelector('figcaption').setAttribute('aria-live', 'polite');
