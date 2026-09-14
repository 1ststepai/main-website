const demo = document.querySelector('#build-demo');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const track = (name, detail) => window.fsaiTrack?.(name, detail);

const genomeExamples = {
  parents: {
    idea: '“I want to build an app that helps parents find things to do with their kids.”',
    fields: ['Build a new product', 'Consumer app', 'Idea', 'Parents and caregivers', 'Beginner', 'Web + mobile', 'Optional', 'No', 'Family preferences', 'Consumer discovery', 'Medium', 'Lean'],
    active: ['Research', 'Product', 'Design', 'Engineering', 'Security', 'Business', 'Discovery', 'Growth', 'Operations'],
  },
  existing: {
    idea: '“I built an app with AI, but I need to know what is safe to launch.”',
    fields: ['Audit an existing build', 'AI-built app', 'Working prototype', 'Existing users', 'Developer', 'Web app', 'Present', 'To assess', 'Account information', 'Repair before growth', 'Needs review', 'Scoped'],
    active: ['Research', 'Product', 'Design', 'Engineering', 'AI', 'Security', 'Business', 'Operations'],
  },
  business: {
    idea: '“I own a moving company. My team spends too much time following up and preparing quotes.”',
    fields: ['Automate business work', 'Internal workflows', 'Operating business', 'Customers and staff', 'Owner + team', 'CRM + web', 'Selective', 'Existing billing', 'Customer records', 'Local discovery', 'Needs review', 'Scoped'],
    active: ['Research', 'Product', 'Design', 'Engineering', 'AI', 'Security', 'Business', 'Operations'],
  },
  growth: {
    idea: '“My product is live, but the right customers are not finding it.”',
    fields: ['Grow a live product', 'Digital product', 'Launched', 'Potential buyers', 'Small team', 'Web + search', 'Selective', 'Varies', 'Analytics', 'Search and channels', 'To assess', 'Lean'],
    active: ['Research', 'Product', 'Design', 'Business', 'Pricing', 'Media', 'Discovery', 'Growth', 'Operations'],
  },
};

const genomeButtons = [...document.querySelectorAll('[data-genome]')];
const genomeFields = ['goal', 'type', 'stage', 'users', 'builder', 'platforms', 'ai', 'payments', 'data', 'growth', 'risk', 'budget'].map((field) => document.querySelector(`#genome-${field}`));
const genomeNodes = [...document.querySelectorAll('[data-capability]')];
genomeButtons.forEach((button) => button.addEventListener('click', () => {
  const example = genomeExamples[button.dataset.genome];
  if (!example || button.classList.contains('is-active')) return;
  genomeButtons.forEach((item) => {
    const active = item === button;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  document.querySelector('#genome-idea').textContent = example.idea;
  genomeFields.forEach((field, index) => { field.textContent = example.fields[index]; });
  genomeNodes.forEach((node) => node.classList.toggle('is-on', example.active.includes(node.dataset.capability)));
  document.querySelector('#genome-activation').textContent = `${example.active.length} relevant lenses; ${genomeNodes.length - example.active.length} remain dormant.`;
  track('os_genome_example_explored', { example: button.dataset.genome });
}));

const capabilityAreas = {
  Build: ['Build the useful first version.', 'From a focused web app to an internal tool, scope, architecture, implementation, testing, and release stay connected.', 'Web & mobile', 'APIs & SaaS', 'Testing & security', 'Release readiness'],
  Design: ['Make the experience make sense.', 'Journeys, prototypes, responsive interfaces, accessibility, and a consistent design system turn the product plan into something people can use.', 'UX research', 'Prototypes', 'Design systems', 'Accessibility'],
  AI: ['Give agents the right work and context.', 'Agent roles, retrieval, model routing, evaluations, token budgets, and fallbacks are chosen around actual tasks.', 'Agents & tools', 'RAG & context', 'Model routing', 'Evaluations'],
  Media: ['Keep the story consistent everywhere.', 'A shared brief can guide imagery, video, captions, voice, demos, and app-store assets without losing the product identity.', 'Images & video', 'Captions & voice', 'Demo assets', '3D when useful'],
  Business: ['Build a product that has a reason to exist.', 'Market research, customers, competitors, positioning, pricing, monetization, and economics inform what gets built.', 'Market signals', 'Positioning', 'Pricing', 'Unit economics'],
  Discovery: ['Help the right people find it.', 'Traditional SEO and newer AI answer surfaces belong in the plan alongside app-store, YouTube, social, directory, and reputation work.', 'Search SEO', 'AEO & GEO', 'LLM visibility', 'App & social search'],
  Grow: ['Turn launch into a learning system.', 'Content, communities, partnerships, referrals, paid channels, and conversion experiments work from the same product truth.', 'Launch plan', 'Content & socials', 'Partnerships', 'Conversion'],
  Sell: ['Make customer conversations coherent.', 'Lead research, CRM stages, demos, proposals, follow-ups, and sales materials use shared positioning and evidence.', 'Lead research', 'Pipeline', 'Proposals', 'Follow-ups'],
  Automate: ['Find the work worth repeating.', 'Map email, CRM, documents, reporting, data sync, schedules, and approvals before building bounded workflows.', 'Email & CRM', 'Documents', 'Reporting', 'Approvals'],
  Operate: ['Keep the product healthy after launch.', 'Analytics, support, billing, incidents, backups, runbooks, and cost monitoring make ongoing ownership explicit.', 'Support', 'Reliability', 'Billing', 'Runbooks'],
  Recover: ['Find the real gaps in an existing build.', 'An audit can compare evidence with expectations, then prioritize security, testing, architecture, continuity, and cost fixes.', 'Baseline', 'Findings', 'Recovery plan', 'Verification'],
  Learn: ['Let customer signals change the plan.', 'Feedback, support, search behavior, experiments, and decisions can feed a prioritized opportunity loop.', 'Customer voice', 'Experiments', 'Evidence', 'Next actions'],
};

const areaButtons = [...document.querySelectorAll('[data-area]')];
areaButtons.forEach((button, index) => button.addEventListener('click', () => {
  if (button.classList.contains('is-active')) return;
  const detail = capabilityAreas[button.dataset.area];
  if (!detail) return;
  areaButtons.forEach((item) => {
    const active = item === button;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  document.querySelector('#capability-index').textContent = `${String(index + 1).padStart(2, '0')} / ${button.dataset.area.toUpperCase()}`;
  document.querySelector('#capability-title').textContent = detail[0];
  document.querySelector('#capability-copy').textContent = detail[1];
  document.querySelector('#capability-examples').replaceChildren(...detail.slice(2).map((text) => {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  }));
  track('os_capability_explored', { area: button.dataset.area });
}));

const ideaForm = document.querySelector('#idea-form');
if (ideaForm) {
  const ideaInput = ideaForm.querySelector('#idea-prompt');
  const previewButton = ideaForm.querySelector('#idea-preview-button');
  const result = ideaForm.querySelector('#idea-result');
  const resultPaths = {
    new: ['Start with the idea.', 'Clarify the person, problem, and first useful outcome before deciding what to build.', '/app-idea-viability-checker.html', 'Explore the current 1stStep.ai App Idea Checker'],
    audit: ['Start with an evidence baseline.', 'Record what the build actually does, then inspect security, quality, business, and growth gaps.', '#audit', 'Review the Audit concept'],
    automate: ['Start by mapping the manual workflow.', 'Observe the volume, handoffs, and errors before estimating savings or choosing automation.', '#business', 'Review Business Owner Mode'],
    grow: ['Start with who should find you.', 'Clarify positioning and the customer questions that lead to search, AI answers, and channels.', '#discovery', 'Review Discovery OS'],
  };
  let engaged = false;
  ideaInput.addEventListener('focus', () => {
    if (engaged) return;
    engaged = true;
    track('os_idea_input_engaged', { placement: 'final' });
  });
  previewButton.disabled = false;
  previewButton.addEventListener('click', () => {
    if (!ideaInput.reportValidity()) return;
    const intent = ideaForm.querySelector('input[name="intent"]:checked').value;
    const path = resultPaths[intent] || resultPaths.new;
    document.querySelector('#idea-result-title').textContent = path[0];
    document.querySelector('#idea-result-copy').textContent = path[1];
    const link = document.querySelector('#idea-result-link');
    link.href = path[2];
    link.firstChild.textContent = `${path[3]} `;
    result.hidden = false;
    result.focus();
    track('os_starting_path_previewed', { intent });
  });
}

if (demo && !motion.matches) {
  const toggle = demo.querySelector('#demo-toggle');
  const replay = demo.querySelector('#demo-replay');
  demo.classList.add('is-animated');

  toggle.addEventListener('click', () => {
    const paused = demo.classList.toggle('is-paused');
    toggle.innerHTML = paused ? 'Play <span aria-hidden="true">▶</span>' : 'Pause <span aria-hidden="true">Ⅱ</span>';
    toggle.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
  });

  replay.addEventListener('click', () => {
    demo.classList.remove('is-running', 'is-paused');
    // Reinsert the class on the next frame so every CSS scene restarts together.
    requestAnimationFrame(() => requestAnimationFrame(() => demo.classList.add('is-running')));
    toggle.innerHTML = 'Pause <span aria-hidden="true">Ⅱ</span>';
    toggle.setAttribute('aria-label', 'Pause animation');
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      demo.classList.toggle('is-running', entry.isIntersecting);
    }, { threshold: 0.15 });
    observer.observe(demo);
  } else {
    demo.classList.add('is-running');
  }
}

if ('IntersectionObserver' in window && !motion.matches) {
  const surfaces = document.querySelectorAll('.motion-surface');
  const motionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => entry.target.classList.toggle('is-in-view', entry.isIntersecting));
  }, { threshold: 0.08 });
  surfaces.forEach((surface) => motionObserver.observe(surface));
  const reveals = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.1 });
  reveals.forEach((element) => observer.observe(element));
  document.documentElement.classList.add('motion-ready');
}
