import { capabilityNames, deriveCapabilities, deriveGenome, flowForBusiness, getRecommendations, interpretGoal, modes, questions, suggestMode } from './onboarding-state.js';

const conversation = document.querySelector('#conversation-content');
const system = document.querySelector('#system-content');
const announcement = document.querySelector('#announcement');
const progressLabel = document.querySelector('#progress-label');
const progressTrack = document.querySelector('#progress-track');
const progressFill = document.querySelector('#progress-fill');
const backButton = document.querySelector('#back-button');
const stageNumber = document.querySelector('#stage-number');
const systemStatus = document.querySelector('#system-status');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const track = (name, detail = {}) => window.fsaiTrack?.(name, detail);
let state = { stage: 'choose', mode: null, goal: '', goalConfirmed: false, answers: {}, qIndex: 0, acceptedRecommendations: [], openRecommendations: [], recommendationChanges: {}, editingRecommendation: null, originUnsure: false };
function clearDownstreamDecisions() {
  state.acceptedRecommendations = [];
  state.openRecommendations = [];
  state.recommendationChanges = {};
  state.editingRecommendation = null;
}
const snapshots = new Map();
let historyKey = 0;
snapshots.set(historyKey, structuredClone(state));
history.replaceState({ osPreviewKey: historyKey }, '', location.pathname);

function go(stage, patch = {}) {
  snapshots.set(history.state?.osPreviewKey, structuredClone(state));
  state = { ...state, ...patch, stage };
  historyKey += 1;
  snapshots.set(historyKey, structuredClone(state));
  history.pushState({ osPreviewKey: historyKey }, '', location.pathname);
  if (stage === 'baseline') track('os_audit_preview_viewed', { mode: 'existing' });
  if (stage === 'recommend') track('os_recommendations_viewed', { mode: state.mode });
  if (stage === 'reveal') track('os_project_os_previewed', { mode: state.mode });
  render(true);
}

window.addEventListener('popstate', (event) => {
  state = structuredClone(snapshots.get(event.state?.osPreviewKey) || { stage: 'choose', mode: null, goal: '', goalConfirmed: false, answers: {}, qIndex: 0, acceptedRecommendations: [], openRecommendations: [], recommendationChanges: {}, editingRecommendation: null, originUnsure: false });
  render(true);
});

const btn = (label, action, kind = 'primary', extra = '') => `<button type="button" class="action-button ${kind}" data-action="${action}" ${extra}>${label}</button>`;
function narrativeNumber() {
  if (state.stage === 'choose') return 1;
  if (state.stage === 'describe') return 2;
  if (state.stage === 'route') return 3;
  if (state.stage === 'interpret') return state.originUnsure ? 4 : 3;
  if (state.stage === 'connect') return state.originUnsure ? 5 : 4;
  const firstQuestion = state.originUnsure ? (state.mode === 'existing' ? 6 : 5) : (state.mode === 'existing' ? 5 : 4);
  if (state.stage === 'questions') return firstQuestion + state.qIndex;
  const afterQuestions = firstQuestion + (questions[state.mode]?.length || 0);
  if (state.stage === 'baseline') return afterQuestions;
  if (state.stage === 'recommend') return afterQuestions + (state.mode === 'existing' ? 1 : 0);
  if (state.stage === 'reveal') return afterQuestions + (state.mode === 'existing' ? 2 : 1);
  return afterQuestions + (state.mode === 'existing' ? 3 : 2);
}
const heading = (_number, eyebrow, title, lede) => `<p class="stage-kicker">${String(narrativeNumber()).padStart(2, '0')} / ${eyebrow}</p><h2 id="stage-title" tabindex="-1">${title}</h2><p class="stage-lede">${lede}</p>`;
const stateTag = (status) => `<span class="state-tag state-${status.toLowerCase().replace(/[^a-z]+/g, '-')}">${escapeHtml(status)}</span>`;

function renderChoose() {
  return `${heading('01', 'CHOOSE YOUR PATH', 'Where are you starting from?', 'A different starting point changes the questions, system view, and next steps.')}
    <div class="path-options" role="group" aria-label="Choose a starting path">${Object.entries(modes).map(([key, mode], i) => `<button type="button" class="path-option" data-action="select-mode" data-mode="${key}"><span class="path-index">0${i + 1}</span><span><strong>${escapeHtml(mode.title)}</strong><small>${escapeHtml(mode.description)}</small></span><b aria-hidden="true">↗</b></button>`).join('')}</div>
    <p class="stage-disclaimer">No signup. No code connection. Your answers stay in this tab.</p>`;
}

function renderDescribe() {
  const prompts = {
    idea: ['What do you want to build?', 'Explain it however you would to a friend.', 'I want to build something that helps…'],
    existing: ['Tell us about the build.', 'What exists, and what do you want to understand or fix?', 'I have a prototype, and I need to know…'],
    business: ['Tell us about your business.', 'What work or bottleneck brought you here?', 'My team spends time each week on…'],
    growth: ['What have you built?', 'Tell us what people should discover and what feels stuck.', 'We built a product for…'],
    unsure: ["That's fine. What are you trying to accomplish?", 'Use your own words. A simple rule will suggest a starting path for you to confirm.', 'I am trying to…'],
  }[state.mode];
  return `${heading('02', 'DESCRIBE THE GOAL', prompts[0], prompts[1])}<form id="goal-form"><label class="field-label" for="goal-input">Your ${modes[state.mode].noun} or current challenge</label><textarea id="goal-input" name="goal" required minlength="8" maxlength="800" rows="7" placeholder="${prompts[2]}">${escapeHtml(state.goal)}</textarea><div class="field-foot"><span>8–800 characters · never submitted</span><span id="char-count">${state.goal.length} / 800</span></div><div class="stage-actions"><button type="submit" class="action-button primary">See what 1stStep understands <span aria-hidden="true">↗</span></button></div></form>`;
}

function renderRoute() {
  const suggested = suggestMode(state.goal);
  return `${heading('03', 'FIND YOUR PATH', 'This looks closest to…', 'A simple rule suggested this route from your words. Choose the direction that feels right; no AI analysis happened.')}
    <div class="interpretation-card"><span>PRELIMINARY ROUTE / NEEDS YOUR CONFIRMATION</span><strong>${escapeHtml(modes[suggested].title)}</strong><p>${escapeHtml(state.goal)}</p></div>
    <p class="choice-label">Which path should shape the next questions?</p><div class="route-options">${Object.entries(modes).filter(([key]) => key !== 'unsure').map(([key, mode]) => `<button class="route-option ${key === suggested ? 'is-suggested' : ''}" type="button" data-action="route-mode" data-mode="${key}">${escapeHtml(mode.title)}${key === suggested ? '<span>Suggested</span>' : ''}</button>`).join('')}</div>`;
}

function renderInterpret() {
  const interpretation = interpretGoal(state.mode, state.goal);
  return `${heading('03', '1STSTEP UNDERSTANDS', "It sounds like you're working on…", 'Confirm or clarify this interpretation before the project profile begins to resolve.')}
    <div class="interpretation-card"><span>RULE-BASED INTERPRETATION / UNCONFIRMED</span><strong>${escapeHtml(interpretation.type)}</strong><p>“${escapeHtml(interpretation.summary)}”</p><small>${interpretation.source}</small></div>
    <div class="stage-actions">${btn("That's right", 'confirm-goal')}${btn('Let me clarify', 'clarify-goal', 'secondary')}</div>`;
}

function renderConnect() {
  return `${heading('04', 'CONNECT YOUR PROJECT', 'Read first. Write later.', 'A future baseline will begin with the exact repository and commit. There is no connector or scan in this preview.')}
    <div class="connector-list"><div><strong>GitHub</strong>${stateTag('PLANNED')}<small>Read-only connection is not available here.</small></div><div><strong>Upload an archive</strong>${stateTag('PLANNED')}<small>No file leaves this page because upload is not implemented.</small></div><div><strong>Another provider</strong>${stateTag('PLANNED')}<small>A future adapter would need a separate permission review.</small></div><div><strong>I can't share code</strong>${stateTag('AVAILABLE')}<small>Continue with a self-reported project profile.</small></div></div>
    <div class="permissions"><div><span>FUTURE READ SCOPE</span><p>Repository contents · metadata · dependencies/config · tests/workflows</p></div><div><span>NOT REQUESTED</span><p>Push code · merge pull requests · delete repository · change settings</p></div></div><p class="stage-disclaimer">No permission is requested or granted in this preview.</p><div class="stage-actions">${btn('Continue without connecting', 'skip-connect')}</div>`;
}

function renderQuestions() {
  const list = questions[state.mode];
  const question = list[state.qIndex];
  const current = state.answers[question.key];
  return `${heading(String(state.qIndex + 4).padStart(2, '0'), `QUESTION ${state.qIndex + 1} OF ${list.length}`, question.title, question.detail)}
    <div class="question-options" role="group" aria-label="${escapeHtml(question.title)}">${question.options.map((option) => `<button class="answer-option ${current === option ? 'is-selected' : ''}" type="button" data-action="answer" data-answer="${escapeHtml(option)}" aria-pressed="${current === option}"><span>${escapeHtml(option)}</span><b aria-hidden="true">${current === option ? '✓' : '↗'}</b></button>`).join('')}</div>
    ${current ? `<div class="response-card" role="status"><span>YOUR ANSWER → SYSTEM RESPONSE</span><p>You said <strong>${escapeHtml(current)}</strong>. The project state and active capabilities have updated on the right.</p></div>` : '<p class="stage-disclaimer">Choose an answer to see the Project Genome change before continuing.</p>'}
    <div class="stage-actions question-desktop-action">${btn(state.qIndex === list.length - 1 ? (state.mode === 'existing' ? 'View the unverified baseline' : 'See preliminary recommendations') : 'Next question', 'next-question', 'primary', current ? '' : 'disabled')}</div>`;
}

function renderBaseline() {
  return `${heading('08', 'PROJECT BASELINE', 'What we know — and what we do not.', 'A real audit must lock a repository, branch, commit, timestamp, stack, and evidence. None was inspected here.')}
    <div class="baseline-grid"><div><span>REPOSITORY</span><strong>Not connected</strong>${stateTag('UNVERIFIED')}</div><div><span>BRANCH / COMMIT</span><strong>Unknown</strong>${stateTag('UNVERIFIED')}</div><div><span>STAGE</span><strong>${escapeHtml(state.answers.stage || 'Not stated')}</strong>${stateTag(state.answers.stage ? 'USER STATED' : 'UNKNOWN')}</div><div><span>CHECKS</span><strong>${escapeHtml(state.answers.evidence || 'Not stated')}</strong>${stateTag(state.answers.evidence ? 'USER STATED' : 'UNKNOWN')}</div></div>
    <div class="readiness-box"><span>PROJECT READINESS / NOT ASSESSED</span><strong>— <small>/ 100</small></strong><p>No scores or findings can be issued without a real baseline and evidence.</p></div><div class="stage-actions">${btn('See the preliminary next steps', 'to-recommend')}</div>`;
}

function renderRecommend() {
  const recommendations = getRecommendations(state);
  return `${heading('09', 'INTELLIGENT NEXT STEPS', state.mode === 'existing' ? 'Your next three steps — before an audit.' : 'Three preliminary directions.', 'These are transparent rules based on your answers, not AI research or verified findings. Accept a direction or leave it open.')}
    <div class="recommend-list">${recommendations.map((rec, index) => `<article class="recommend-card ${rec.accepted ? 'is-accepted' : ''} ${state.openRecommendations.includes(rec.title) ? 'is-open' : ''}"><div class="recommend-top"><span>0${index + 1} / ${state.mode === 'existing' ? 'PRE-AUDIT STEP' : 'RECOMMENDATION'}</span>${stateTag(rec.confidence)}</div><h3>${escapeHtml(rec.title)}</h3><p>${escapeHtml(rec.reason)}</p><small>${escapeHtml(rec.evidence)} · no external research</small>${state.mode === 'existing' ? `<div class="preaudit-meta"><span>Priority: preliminary order ${index + 1}</span><span>Impact: ${['Baseline clarity', 'Risk visibility', 'Action focus'][index]}</span><span>Effort: ${['Requires project facts', 'Requires evidence', 'Requires reviewed findings'][index]}</span><span>Evidence: unverified</span></div><details class="why-detail"><summary>See why</summary><p>${escapeHtml(rec.reason)} A real audit must attach repository evidence before this becomes a finding.</p></details><button class="remediation-planned" type="button" disabled>Start remediation · planned</button>` : ''}${state.recommendationChanges[rec.title] ? `<div class="user-change"><span>YOUR PROPOSED CHANGE / USER-STATED</span><p>${escapeHtml(state.recommendationChanges[rec.title])}</p></div>` : ''}${state.editingRecommendation === rec.title ? `<div class="change-editor"><label for="change-${index}">What direction would you prefer?</label><textarea id="change-${index}" maxlength="140" rows="3" data-change-input="${index}" placeholder="A different next step…">${escapeHtml(state.recommendationChanges[rec.title] || '')}</textarea><button type="button" data-action="save-change" data-index="${index}">Save as open decision</button><button type="button" data-action="cancel-change">Cancel</button></div>` : ''}<div class="recommend-actions"><button type="button" data-action="accept-recommendation" data-index="${index}" aria-pressed="${rec.accepted}">${rec.accepted ? '✓ Accepted' : 'Accept'}</button><button type="button" data-action="change-recommendation" data-index="${index}">${state.openRecommendations.includes(rec.title) ? 'Edit change' : 'Change'}</button></div></article>`).join('')}</div>
    <div class="stage-actions">${btn(state.mode === 'existing' ? 'Preview the recovery OS' : 'Reveal the proposed Project OS', 'to-reveal')}</div>`;
}

function renderReveal() {
  const active = deriveCapabilities(state);
  const sections = state.mode === 'idea' ? ['Project', 'Engineering', 'Business', 'Discovery', 'Security', 'Testing']
    : state.mode === 'existing' ? ['Project', 'Audit', 'Engineering', 'Security', 'Testing', 'Recovery']
    : state.mode === 'business' ? ['Business', 'Workflows', 'Automation', 'Operations', 'Security']
    : ['Project', 'Discovery', 'Growth', 'Business', 'Analytics'];
  const files = state.mode === 'idea' ? ['PROJECT.md', 'PRODUCT_REQUIREMENTS.md', 'ARCHITECTURE.md', 'SECURITY.md']
    : state.mode === 'existing' ? ['BASELINE.md', 'AUDIT_PLAN.md', 'REMEDIATION.md']
    : state.mode === 'business' ? ['WORKFLOW_MAP.md', 'AUTOMATION_OPPORTUNITIES.md']
    : ['DISCOVERY_BASELINE.md', 'GROWTH_EXPERIMENTS.md'];
  return `${heading('10', 'THE PROJECT OS REVEAL', state.mode === 'existing' ? 'A recovery system, proposed.' : 'Your Project OS, proposed.', 'Your answers now shape a possible workspace. The structure below is a preview; no files have been generated or saved.')}
    <div class="reveal-route"><span>YOUR GOAL</span><i aria-hidden="true">→</i><span>${active.size} ACTIVE LENSES</span><i aria-hidden="true">→</i><span>${state.acceptedRecommendations.length ? 'YOUR SELECTED DIRECTION' : 'OPEN NEXT DECISION'}</span></div>
    <div class="reveal-sections">${sections.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
    <div class="decision-preview"><span>YOUR DIRECTION / LOCAL PREVIEW</span>${getRecommendations(state).map((rec) => `<div><strong>${escapeHtml(rec.title)}</strong>${stateTag(rec.accepted ? 'ACCEPTED' : state.openRecommendations.includes(rec.title) ? 'OPEN' : 'UNREVIEWED')}${state.recommendationChanges[rec.title] ? `<small>Your change: ${escapeHtml(state.recommendationChanges[rec.title])}</small>` : ''}</div>`).join('')}</div>
    <div class="file-preview"><span>PROPOSED ARTIFACTS / NOT GENERATED</span>${files.map((file) => `<div><b>⌁</b><strong>${file}</strong>${stateTag('PLANNED')}</div>`).join('')}</div>
    ${state.mode === 'existing' ? '<p class="stage-disclaimer">Readiness remains unassessed. A future connected audit must verify evidence before any finding or score.</p>' : '<p class="stage-disclaimer">The project chooses the OS. Dormant areas can activate when later answers or evidence justify them.</p>'}
    <div class="stage-actions">${btn('How can I continue?', 'to-continue')}</div>`;
}

function renderContinue() {
  return `${heading('11', 'THE NEXT STEP', 'Use the AI you already have.', 'The preview can show a direction today. Export, provider handoff, repository connection, and saving a Project OS need later product work.')}
    <div class="provider-grid"><div><strong>Claude Code</strong>${stateTag('PLANNED')}<small>Provider workflow not connected.</small></div><div><strong>Codex</strong>${stateTag('PLANNED')}<small>Provider workflow not connected.</small></div><div><strong>Other AI</strong>${stateTag('PLANNED')}<small>Provider-neutral handoff intended.</small></div><div><strong>Download Project OS</strong>${stateTag('PLANNED')}<small>No files were compiled.</small></div></div>
    <div class="outcome-card"><span>GOAL → ROUTE → NEXT STEP</span><strong>${escapeHtml(modes[state.mode].short)}</strong><p>${escapeHtml(state.goal)}</p><small>Preview complete. Your answers will disappear on reload.</small></div>
    <div class="stage-actions"><a class="action-button primary" href="/journey/" data-fsai-event="os_preview_journey_click" data-fsai-placement="end">Talk through your project ↗</a><a class="action-button secondary" href="/os">Explore 1stStep OS</a></div><p class="stage-disclaimer">Begin Your Journey is the existing consultancy path. It does not save this preview or create an OS account.</p>`;
}

function renderConversation() {
  switch (state.stage) {
    case 'choose': return renderChoose();
    case 'describe': return renderDescribe();
    case 'route': return renderRoute();
    case 'interpret': return renderInterpret();
    case 'connect': return renderConnect();
    case 'questions': return renderQuestions();
    case 'baseline': return renderBaseline();
    case 'recommend': return renderRecommend();
    case 'reveal': return renderReveal();
    case 'continue': return renderContinue();
    default: return renderChoose();
  }
}

function renderSystem() {
  if (state.stage === 'choose') return `<div class="system-intro"><div class="signal-route"><span class="signal-node is-active">STARTING POINT</span><i></i><span class="signal-node">INTELLIGENT ROUTE</span><i></i><span class="signal-node">NEXT STEP</span></div><h2 id="system-title">One goal.<br /><em>A path that responds.</em></h2><p>Choose a starting point. Then watch the project profile, active capabilities, and next questions change with your answers.</p><div class="system-empty">PROJECT STATE <b>WAITING FOR YOUR CHOICE</b></div></div>`;
  const genome = deriveGenome(state);
  const active = deriveCapabilities(state);
  const filled = Object.values(genome).filter((signal) => signal.state !== 'UNKNOWN').length;
  const resolved = Object.entries(genome).filter(([, signal]) => signal.state === 'CONFIRMED' || signal.state === 'RECOMMENDED').slice(-3);
  const lastQuestion = state.stage === 'questions' ? questions[state.mode][state.qIndex] : null;
  const currentAnswer = lastQuestion && state.answers[lastQuestion.key];
  const changeMeaning = lastQuestion?.key === 'ai' && currentAnswer === 'Yes, it is central' ? 'AI is now an active lens for this preview.'
    : lastQuestion?.key === 'data' && currentAnswer === 'Yes' ? 'Security is more prominent; a real privacy review is still needed.'
    : lastQuestion?.key === 'platform' && currentAnswer === 'Web + mobile' ? 'Cross-platform engineering becomes relevant; no stack has been chosen.'
    : lastQuestion?.key === 'workflow' ? 'A draft process hypothesis appears below; its steps need confirmation.'
    : lastQuestion?.key === 'channels' ? 'Discovery channels remain self-reported until measured.'
    : 'The Project Genome now reflects what you stated.';
  const response = currentAnswer ? `<div class="system-response"><span>LAST STATE CHANGE</span><p><strong>${escapeHtml(lastQuestion.key)}</strong> resolved from your answer: ${escapeHtml(currentAnswer)}. ${escapeHtml(changeMeaning)}</p></div>`
    : state.goalConfirmed ? '<div class="system-response"><span>LAST STATE CHANGE</span><p>Your goal is confirmed. Only answered signals resolve; the rest remain unknown.</p></div>'
    : '<div class="system-response"><span>INTERPRETATION PENDING</span><p>Your words are visible as an inferred goal until you confirm them.</p></div>';
  const modeView = state.mode === 'business' && state.answers.workflow ? `<div class="mode-state"><span>DRAFT PROCESS HYPOTHESIS / NOT OBSERVED</span><div class="process-flow">${flowForBusiness(state.answers).map((item, index) => `<div><b>${String(index + 1).padStart(2, '0')}</b>${escapeHtml(item)}</div>`).join('')}</div><small>Steps are illustrative; no process was observed or automated.</small><div class="opportunity-preview"><span>AUTOMATION CANDIDATES / PRELIMINARY ORDER</span><div><b>01</b> Draft or prepare the repeated handoff ${stateTag('UNVERIFIED')}</div><div><b>02</b> Record a reviewed outcome ${stateTag('UNVERIFIED')}</div><div><b>03</b> Measure volume before estimating ROI ${stateTag('UNVERIFIED')}</div></div></div>`
    : state.mode === 'growth' ? `<div class="mode-state"><span>DISCOVERY GENOME / SELF-REPORTED</span><div class="discovery-states"><div>Positioning ${stateTag('UNVERIFIED')}</div><div>Technical SEO ${stateTag('NEEDS CONNECTION')}</div><div>Content ${stateTag('UNVERIFIED')}</div><div>Entity authority ${stateTag('UNVERIFIED')}</div><div>AI answerability ${stateTag('NEEDS CONNECTION')}</div><div>Third-party presence ${stateTag('NEEDS CONNECTION')}</div><div>Social distribution ${stateTag('UNVERIFIED')}</div><div>Conversion ${stateTag('NEEDS CONNECTION')}</div><div>Analytics ${stateTag('NEEDS CONNECTION')}</div><div>Stated channel ${stateTag(state.answers.channels ? 'USER STATED' : 'UNKNOWN')}</div></div><small>No search, channel, or conversion data was measured.</small></div>`
    : state.mode === 'existing' ? `<div class="mode-state"><span>REPOSITORY BASELINE</span><div class="baseline-mini"><strong>Not connected</strong>${stateTag('UNVERIFIED')}</div><small>No code or repository metadata has been inspected.</small></div>` : '';
  const mobileNext = state.stage === 'questions' ? `<div class="mobile-next-action">${btn(state.qIndex === questions[state.mode].length - 1 ? (state.mode === 'existing' ? 'View the unverified baseline' : 'See preliminary recommendations') : 'Next question', 'next-question', 'primary', currentAnswer ? '' : 'disabled')}</div>` : '';
  return `<div class="system-heading"><p>PROJECT STATE / ${escapeHtml(modes[state.mode]?.short || 'FINDING PATH')}</p><h2 id="system-title">The system is <em>learning your project.</em></h2><small>${filled} of 12 signals have a preliminary value</small></div>${response}${modeView}
    <div class="signal-highlights" aria-label="Recently resolved project signals">${resolved.map(([key, signal]) => `<div><span>${escapeHtml(key)}</span><strong>${escapeHtml(signal.value)}</strong>${stateTag(signal.state)}</div>`).join('')}</div>
    <details class="genome-live" ${window.matchMedia('(max-width: 650px)').matches ? '' : 'open'}><summary class="module-head"><span>PROJECT GENOME <small class="genome-expand-label">/ SHOW ALL SIGNALS</small></span>${stateTag('PREVIEW')}</summary><dl>${Object.entries(genome).map(([key, signal]) => `<div class="genome-row"><dt>${escapeHtml(key)}</dt><dd><span>${escapeHtml(signal.value)}</span>${stateTag(signal.state)}</dd></div>`).join('')}</dl></details>
    <div class="capabilities-live"><div class="module-head"><span>CAPABILITY ACTIVATION</span><small>${active.size} ACTIVE · ${capabilityNames.length - active.size} DORMANT</small></div><div class="capability-grid">${capabilityNames.map((name) => `<span class="${active.has(name) ? 'is-active' : ''}"><i></i>${name}</span>`).join('')}</div><p>Active means relevant to this preview, not that an agent is running.</p></div>${mobileNext}`;
}

function progressValue() {
  const map = { choose: 0, describe: 12, route: 18, interpret: 23, connect: 31, questions: 35, baseline: 70, recommend: 76, reveal: 90, continue: 100 };
  if (state.stage === 'questions') return 35 + Math.round(((state.qIndex + (state.answers[questions[state.mode][state.qIndex].key] ? 1 : 0)) / questions[state.mode].length) * 34);
  return map[state.stage] ?? 0;
}

function render(focus = false) {
  document.body.classList.toggle('is-in-flow', state.stage !== 'choose');
  conversation.innerHTML = renderConversation();
  system.innerHTML = renderSystem();
  document.querySelector('.system-panel').classList.remove('is-updated');
  requestAnimationFrame(() => document.querySelector('.system-panel').classList.add('is-updated'));
  const percent = progressValue();
  progressTrack.setAttribute('aria-valuenow', String(percent));
  progressFill.style.width = `${percent}%`;
  progressLabel.textContent = state.stage === 'questions' ? `QUESTION ${state.qIndex + 1} / ${questions[state.mode].length}` : `${String(narrativeNumber()).padStart(2, '0')} / ${state.stage.toUpperCase()}`;
  stageNumber.textContent = `${String(narrativeNumber()).padStart(2, '0')} / ${state.stage.toUpperCase()}`;
  systemStatus.textContent = state.stage === 'choose' ? 'WAITING FOR A START' : state.stage === 'continue' ? 'PREVIEW COMPLETE' : 'STATE UPDATED';
  backButton.hidden = state.stage === 'choose';
  announcement.textContent = state.stage === 'questions' && state.answers[questions[state.mode][state.qIndex].key] ? 'Project state updated from your answer.' : `Now showing ${state.stage === 'questions' ? 'question ' + (state.qIndex + 1) : state.stage}.`;
  if (focus) {
    document.querySelector('#stage-title')?.focus({ preventScroll: true });
    document.querySelector('.stage-layout')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

conversation.addEventListener('input', (event) => {
  if (event.target.id === 'goal-input') {
    const count = document.querySelector('#char-count');
    if (count) count.textContent = `${event.target.value.length} / 800`;
  }
});

conversation.addEventListener('submit', (event) => {
  if (event.target.id !== 'goal-form') return;
  event.preventDefault();
  const goal = event.target.goal.value.trim();
  if (goal.length < 8) { event.target.goal.setCustomValidity('Please add at least 8 characters.'); event.target.goal.reportValidity(); return; }
  event.target.goal.setCustomValidity('');
  if (state.goal !== goal) {
    state.answers = {};
    state.qIndex = 0;
    clearDownstreamDecisions();
  }
  state.goal = goal;
  state.goalConfirmed = false;
  snapshots.set(history.state?.osPreviewKey, structuredClone(state));
  track('os_goal_submitted', { mode: state.mode, length_bucket: goal.length < 80 ? 'short' : goal.length < 300 ? 'medium' : 'long' });
  go(state.mode === 'unsure' ? 'route' : 'interpret');
});

document.querySelector('.stage-layout').addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'select-mode') {
    const mode = target.dataset.mode;
    if (!modes[mode]) return;
    state = { stage: 'choose', mode, goal: '', goalConfirmed: false, answers: {}, qIndex: 0, acceptedRecommendations: [], openRecommendations: [], recommendationChanges: {}, editingRecommendation: null, originUnsure: mode === 'unsure' };
    track('os_onboarding_started', { mode });
    track('os_start_mode_selected', { mode });
    if (mode === 'business') track('os_business_flow_started', { mode });
    if (mode === 'growth') track('os_discovery_flow_started', { mode });
    go('describe');
  } else if (action === 'route-mode') {
    if (state.mode !== target.dataset.mode) {
      state.answers = {};
      state.qIndex = 0;
      clearDownstreamDecisions();
    }
    state.mode = target.dataset.mode;
    track('os_start_mode_selected', { mode: state.mode, via: 'unsure' });
    go('interpret');
  } else if (action === 'confirm-goal') {
    state.goalConfirmed = true;
    track('os_interpretation_confirmed', { mode: state.mode });
    go(state.mode === 'existing' ? 'connect' : 'questions');
  } else if (action === 'clarify-goal') {
    go('describe');
  } else if (action === 'skip-connect') {
    track('os_repository_connection_skipped', { mode: 'existing' });
    go('questions');
  } else if (action === 'answer') {
    const question = questions[state.mode][state.qIndex];
    if (!question.options.includes(target.dataset.answer)) return;
    if (state.answers[question.key] !== target.dataset.answer) clearDownstreamDecisions();
    state.answers[question.key] = target.dataset.answer;
    snapshots.set(history.state?.osPreviewKey, structuredClone(state));
    track('os_question_answered', { mode: state.mode, question: question.key });
    track('os_genome_updated', { mode: state.mode, question: question.key });
    render();
  } else if (action === 'next-question') {
    const question = questions[state.mode][state.qIndex];
    if (!state.answers[question.key]) return;
    if (state.qIndex < questions[state.mode].length - 1) go('questions', { qIndex: state.qIndex + 1 });
    else go(state.mode === 'existing' ? 'baseline' : 'recommend');
  } else if (action === 'to-recommend') {
    go('recommend');
  } else if (action === 'accept-recommendation' || action === 'change-recommendation') {
    const rec = getRecommendations(state)[Number(target.dataset.index)];
    if (!rec) return;
    if (action === 'accept-recommendation') {
      state.acceptedRecommendations = state.acceptedRecommendations.filter((name) => name !== rec.title).concat(rec.title);
      state.openRecommendations = state.openRecommendations.filter((name) => name !== rec.title);
      delete state.recommendationChanges[rec.title];
      state.editingRecommendation = null;
    } else state.editingRecommendation = rec.title;
    snapshots.set(history.state?.osPreviewKey, structuredClone(state));
    track('os_recommendation_decision', { mode: state.mode, index: Number(target.dataset.index) + 1, decision: action === 'accept-recommendation' ? 'accept' : 'change' });
    render();
  } else if (action === 'save-change') {
    const rec = getRecommendations(state)[Number(target.dataset.index)];
    const input = document.querySelector(`[data-change-input="${target.dataset.index}"]`);
    const change = input?.value.trim() || '';
    if (!rec || change.length < 3) { input?.focus(); return; }
    state.recommendationChanges[rec.title] = change.slice(0, 140);
    state.openRecommendations = state.openRecommendations.filter((name) => name !== rec.title).concat(rec.title);
    state.acceptedRecommendations = state.acceptedRecommendations.filter((name) => name !== rec.title);
    state.editingRecommendation = null;
    snapshots.set(history.state?.osPreviewKey, structuredClone(state));
    track('os_recommendation_change_saved', { mode: state.mode, index: Number(target.dataset.index) + 1 });
    render();
  } else if (action === 'cancel-change') {
    state.editingRecommendation = null;
    render();
  } else if (action === 'to-reveal') {
    go('reveal');
  } else if (action === 'to-continue') {
    go('continue');
  }
});

backButton.addEventListener('click', () => history.back());
render();
