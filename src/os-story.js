const story = document.querySelector('[data-os-story]');

if (story) {
  const tabs = [...story.querySelectorAll('[data-story-step]')];
  const panel = story.querySelector('#story-panel');
  const count = story.querySelector('#story-step-count');
  const badge = (label, kind = '') => `<span class="story-badge ${kind}">${label}</span>`;
  const detail = (title, content) => `<details class="story-detail"><summary>${title}<span aria-hidden="true">↗</span></summary><div>${content}</div></details>`;
  const frame = (eyebrow, title, status, description, visual, notes) => `
    <div class="story-stage">
      <div class="story-intro"><div><small>${eyebrow}</small><h3>${title}</h3><p>${description}</p></div>${badge(status, 'story-badge-status')}</div>
      <div class="story-content"><div class="story-visual">${visual}</div><aside class="story-notes">${notes}</aside></div>
    </div>`;

  const stages = {
    connect: frame('01 / CONNECT YOUR PROJECT', 'Start with your project.', 'PUBLIC FIRST LOOK',
      'Enter a website or public GitHub link to see visible signals and one evidence-backed next step. A connected project audit goes deeper.',
      `<div class="story-connect-card"><span class="story-connect-icon" aria-hidden="true">◉</span><strong>Start with your project</strong><small>Website URL or public GitHub link</small><div class="story-connect-input">your-site.com <span>PUBLIC LINK</span></div><a href="/os/start/" data-fsai-event="os_onboarding_entry_click" data-fsai-placement="home_demo">Run the public first look →</a></div>`,
      `<div class="story-simple-head"><span>THE PATH AHEAD</span>${badge('START HERE')}</div><div class="story-simple-path"><div><b>1</b><span><strong>Share a link</strong><small>Your website or public project</small></span></div><div><b>2</b><span><strong>See what is visible</strong><small>Source-backed signals and unknowns</small></span></div><div><b>3</b><span><strong>Choose your next step</strong><small>One practical direction</small></span></div></div><div class="story-truth">The first look checks public material. Private code stays private.</div>`),
    audit: frame('02 / EVIDENCE BEFORE SCORES', 'Find what actually needs attention.', 'AUDIT METHOD',
      'Applicable checks produce findings with a reason, an owner, and evidence. Unknown stays unknown.',
      `<div class="story-checks"><div><span>Repository baseline</span>${badge('REQUIRED')}</div><div><span>Deterministic checks</span>${badge('VERIFY')}</div><div><span>Authentication · Security</span>${badge('REVIEW')}</div><div><span>Architecture · Tests</span>${badge('REVIEW')}</div><div><span>Accessibility · Release</span>${badge('REVIEW')}</div></div>
       ${detail('Why release verification matters', '<p><strong>The concern:</strong> A change can ship without a reproducible check if the release gate is missing.</p><p><strong>Evidence needed:</strong> Exact candidate, required checks, and recorded results.</p><p><strong>Next:</strong> Verify the release check against that candidate.</p>')}`,
      `<h4>What you would see</h4><p>Strengths, weaknesses, risks, and top priorities—each tied to actual evidence when a connected audit exists.</p>`),
    plan: frame('03 / WORK FOLLOWS EVIDENCE', 'Turn findings into a Ship Board.', 'PLAN THE WORK',
      'The most important issue moves first. The rest stays visible without becoming a wall of tasks.',
      `<div class="story-board"><div><b>P0</b><strong>Release-blocking risk</strong><small>Owner and acceptance criteria required</small></div><div><b>P1</b><strong>Next verified fix</strong><small>Evidence attached to the work</small></div><div><b>NEXT</b><strong>Improve the experience</strong><small>After the release-critical path</small></div><div><b>LATER</b><strong>Opportunity backlog</strong><small>Explicitly outside this milestone</small></div></div>`,
      `<h4>A smaller team, chosen on purpose</h4><p>Lead Engineer and Independent Auditor anchor the OS design. Specialists appear only when project evidence calls for them.</p>`),
    build: frame('04 / BOUNDED IMPLEMENTATION', 'Give the blocker an owner.', 'OWN THE WORK',
      'Engineering can work through a scoped task while the system keeps the evidence and next gate attached.',
      `<div class="story-work-item"><div><span>WORK ITEM</span>${badge('IN PROGRESS')}</div><h4>Make release checks reproducible</h4><p>Acceptance: the exact candidate runs the required checks and stores their result.</p><div class="story-work-states"><span>ASSIGNED</span><b>→</b><span>IMPLEMENTING</span><b>→</b><span>TESTING</span><b>→</b><span>READY FOR VERIFICATION</span></div></div>`,
      `<h4>Who is responsible?</h4>${detail('Lead Engineer', '<p><strong>Responsibility:</strong> implement the bounded work item.</p><p><strong>Evidence:</strong> exact candidate and verification results when available.</p>')}`),
    verify: frame('05 / THREE DIFFERENT CLAIMS', 'A fix is not done because someone said so.', 'VERIFY THE WORK',
      'Checks run during engineering. Independent reasoning belongs at a meaningful milestone or high-risk exception.',
      `<div class="story-verification"><div><span>ENGINEER REPORTED</span><strong>Implementation complete</strong><small>Claim from the person doing the work</small></div><div><span>SYSTEM VERIFIED</span><strong>Deterministic checks passed</strong><small>Build, tests, browser, security as applicable</small></div><div><span>INDEPENDENTLY AUDITED</span><strong>Milestone review</strong><small>Evidence-backed PASS, FAIL, INCONCLUSIVE or ESCALATE</small></div></div>`,
      `<h4>Failure has a route back</h4><p>FAIL becomes a bounded remediation item. The integrated remediation batch is checked again before a new milestone audit.</p>`),
    deploy: frame('06 / CONTROLLED RELEASE', 'See what still blocks launch.', 'RELEASE GATES',
      'A release decision is based on explicit gates. The customer sees what happened, who is handling it, and whether action is needed.',
      `<div class="story-command"><div class="story-command-head"><strong>PROJECT OVERVIEW</strong>${badge('GATE VIEW')}</div><div class="story-command-grid"><div><small>LAUNCH READINESS</small><strong>Awaiting gate review</strong></div><div><small>CURRENT WORK</small><strong>Release candidate</strong></div><div><small>AUDITS</small><strong>Milestone review</strong></div><div><small>YOUR ACTION</small><strong>Only if a decision is required</strong></div></div><div class="story-command-gates"><span>Baseline</span><span>Checks</span><span>Audit</span><span>Owner approval</span></div></div>`,
      `<h4>Open the details</h4>${detail('Release gate', '<p><strong>Why it matters:</strong> A deterministic pass alone cannot certify a release.</p><p><strong>Next:</strong> Independent review of a pinned candidate.</p>')}${detail('Independent Auditor', '<p><strong>Responsibility:</strong> challenge milestone evidence independently.</p>')}`),
  };
  const capabilityStates = { connect: 'PLANNED', audit: 'ILLUSTRATIVE', plan: 'ILLUSTRATIVE', build: 'ILLUSTRATIVE', verify: 'ILLUSTRATIVE', deploy: 'ILLUSTRATIVE' };

  function select(index, focus = false) {
    const chosen = (index + tabs.length) % tabs.length;
    tabs.forEach((tab, position) => {
      const active = position === chosen;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    const step = tabs[chosen].dataset.storyStep;
    story.style.setProperty('--story-progress', `${((chosen + 0.5) / tabs.length) * 100}%`);
    panel.setAttribute('aria-labelledby', tabs[chosen].id);
    panel.dataset.capabilityState = capabilityStates[step];
    panel.innerHTML = stages[step];
    count.textContent = `${String(chosen + 1).padStart(2, '0')} / 06`;
    if (focus) tabs[chosen].focus();
    window.fsaiTrack?.('os_story_step_view', { step });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', (event) => {
      const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? index + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? index - 1
          : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
      if (next === null) return;
      event.preventDefault();
      select(next, true);
    });
  });
  select(0);
}

const transformation = document.querySelector('.story-transformation');
if (transformation && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      transformation.classList.add('is-visible');
      observer.disconnect();
    }
  }, { threshold: 0.2 });
  observer.observe(transformation);
} else transformation?.classList.add('is-visible');

const progressionItems = [...document.querySelectorAll('[data-progression]')];
if (progressionItems.length) {
  const current = document.querySelector('#progression-current');
  const fill = document.querySelector('#progression-fill');
  const count = document.querySelector('#progression-count');
  function setProgression(index) {
    progressionItems.forEach((item, position) => item.classList.toggle('is-current', position === index));
    current.textContent = progressionItems[index].querySelector('h3').textContent;
    fill.style.width = `${((index + 1) / progressionItems.length) * 100}%`;
    count.textContent = `${String(index + 1).padStart(2, '0')} / 07`;
  }
  setProgression(0);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) setProgression(progressionItems.indexOf(visible[0].target));
    }, { rootMargin: '-20% 0px -50% 0px', threshold: 0 });
    progressionItems.forEach((item) => observer.observe(item));
  }
}
