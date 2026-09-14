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
    connect: frame('01 / CONNECT YOUR PROJECT', 'Connect Your Project', 'PLANNED CONNECTION',
      'Begin with a public website or repository link. A future read-only connection would map the project and pin its exact baseline.',
      `<div class="story-connect-card"><span class="story-connect-icon" aria-hidden="true">◉</span><strong>Start with your project</strong><small>Website URL or public GitHub link</small><div class="story-connect-input">your-site.com <span>PUBLIC LINK</span></div><a href="/os/start/" data-fsai-event="os_onboarding_entry_click" data-fsai-placement="home_demo">Open first-look preview →</a><small>No repository is connected from this demo.</small></div>`,
      `<div class="story-file-head"><span>Example project structure</span>${badge('SAMPLE')}</div><div class="story-file-tree"><div><i>⌑</i> src/ <span>application</span></div><div><i>⌑</i> tests/ <span>verification</span></div><div><i>⌑</i> package.json <span>dependencies</span></div><div><i>⌑</i> workflow.yml <span>release</span></div></div><div class="story-route"><span>REPOSITORY</span><b>→</b><span>STACK</span><b>→</b><span>BASELINE</span></div><div class="story-truth">Illustrative files only. No scan has run.</div>`),
    audit: frame('02 / EVIDENCE BEFORE SCORES', 'Find what actually needs attention.', 'ILLUSTRATIVE AUDIT',
      'Applicable checks produce findings with a reason, an owner, and evidence. Unknown stays unknown.',
      `<div class="story-checks"><div><span>Repository baseline</span>${badge('NOT CONNECTED')}</div><div><span>Deterministic checks</span>${badge('SAMPLE')}</div><div><span>Authentication · Security</span>${badge('SAMPLE')}</div><div><span>Architecture · Tests</span>${badge('SAMPLE')}</div><div><span>Accessibility · Release</span>${badge('SAMPLE')}</div></div>
       ${detail('Example finding · missing release verification', '<p><strong>What we found:</strong> The sample workflow has no recorded release gate.</p><p><strong>Why it matters:</strong> A change could ship without a reproducible check.</p><p><strong>Technical evidence:</strong> Illustrative only; no repository was inspected.</p><p><strong>What happens next:</strong> Define the release check and verify it against an exact candidate.</p>')}`,
      `<h4>What you would see</h4><p>Strengths, weaknesses, risks, and the top priorities—each tied to actual evidence when a real audit exists.</p><div class="story-truth">No audit runs from this homepage.</div>`),
    plan: frame('03 / WORK FOLLOWS EVIDENCE', 'Turn findings into a Ship Board.', 'ILLUSTRATIVE PLAN',
      'The most important issue moves first. The rest stays visible without becoming a wall of tasks.',
      `<div class="story-board"><div><b>P0</b><strong>Release-blocking risk</strong><small>Owner and acceptance criteria required</small></div><div><b>P1</b><strong>Next verified fix</strong><small>Evidence attached to the work</small></div><div><b>NEXT</b><strong>Improve the experience</strong><small>After the release-critical path</small></div><div><b>LATER</b><strong>Opportunity backlog</strong><small>Explicitly outside this milestone</small></div></div>`,
      `<h4>A smaller team, chosen on purpose</h4><p>Lead Engineer and Independent Auditor anchor the proposed OS. Specialists appear only when project evidence calls for them.</p><div class="story-truth">Priorities here are sample labels, not findings about your project.</div>`),
    build: frame('04 / BOUNDED IMPLEMENTATION', 'Give the blocker an owner.', 'ILLUSTRATIVE WORK',
      'Engineering can work through a scoped task while the system keeps the evidence and next gate attached.',
      `<div class="story-work-item"><div><span>WORK ITEM / SAMPLE</span>${badge('IMPLEMENTING')}</div><h4>Make release checks reproducible</h4><p>Acceptance: the exact candidate runs the required checks and stores their result.</p><div class="story-work-states"><span>ASSIGNED</span><b>→</b><span>IMPLEMENTING</span><b>→</b><span>TESTING</span><b>→</b><span>READY FOR VERIFICATION</span></div></div>`,
      `<h4>Who is responsible?</h4>${detail('Lead Engineer · proposed role', '<p><strong>Responsibility:</strong> implement the bounded work item.</p><p><strong>Current task:</strong> sample release verification.</p><p><strong>Status:</strong> illustrative only; no runtime is active.</p><p><strong>Evidence:</strong> none from a connected customer project.</p>')}<div class="story-truth">This is a storyboard, not live agent activity.</div>`),
    verify: frame('05 / THREE DIFFERENT CLAIMS', 'A fix is not done because someone said so.', 'ILLUSTRATIVE VERIFICATION',
      'Checks run during engineering. Independent reasoning belongs at a meaningful milestone or high-risk exception.',
      `<div class="story-verification"><div><span>ENGINEER REPORTED</span><strong>Implementation complete</strong><small>Claim from the person doing the work</small></div><div><span>SYSTEM VERIFIED</span><strong>Deterministic checks passed</strong><small>Build, tests, browser, security as applicable</small></div><div><span>INDEPENDENTLY AUDITED</span><strong>Milestone review</strong><small>Evidence-backed PASS, FAIL, INCONCLUSIVE or ESCALATE</small></div></div>`,
      `<h4>Failure has a route back</h4><p>FAIL becomes a bounded remediation item. The integrated remediation batch is checked again before a new milestone audit.</p><div class="story-truth">All statuses shown are sample states, not actual test results.</div>`),
    deploy: frame('06 / CONTROLLED RELEASE', 'See what still blocks launch.', 'ILLUSTRATIVE COMMAND CENTER',
      'A release decision is based on explicit gates. The customer sees what happened, who is handling it, and whether action is needed.',
      `<div class="story-command"><div class="story-command-head"><strong>PROJECT OVERVIEW</strong>${badge('SAMPLE')}</div><div class="story-command-grid"><div><small>LAUNCH READINESS</small><strong>Awaiting gate review</strong></div><div><small>CURRENT WORK</small><strong>Release candidate</strong></div><div><small>AUDITS</small><strong>Milestone review</strong></div><div><small>YOUR ACTION</small><strong>Only if a decision is required</strong></div></div><div class="story-command-gates"><span>Baseline</span><span>Checks</span><span>Audit</span><span>Owner approval</span></div></div>`,
      `<h4>Open the details</h4>${detail('Release gate · illustrative', '<p><strong>Problem:</strong> A sample milestone audit is pending.</p><p><strong>Why it matters:</strong> A deterministic pass alone cannot certify a release.</p><p><strong>Status:</strong> waiting for independent review.</p><p><strong>Who handles it:</strong> Audit Supervisor routes the packet.</p><p><strong>Technical evidence:</strong> no real project evidence exists in this demo.</p>')}${detail('Independent Auditor · proposed role', '<p><strong>Responsibility:</strong> challenge milestone evidence independently.</p><p><strong>Runtime/session:</strong> none connected to this sample.</p><p><strong>Current status:</strong> illustrative; no audit job was created.</p>')}<div class="story-truth">No OS was deployed and no release gate has passed here.</div>`),
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
    count.textContent = `${String(index + 1).padStart(2, '0')} / 07 · ILLUSTRATIVE`;
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
