import { capabilityNames, deriveCapabilities, deriveGenome, flowForBusiness, getRecommendations, interpretGoal, modes, normalizeAuditTarget, questions, suggestMode } from './onboarding-state.js';
import { buildPublicRoast } from '../../lib/osPublicRoast.js';

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
let firstLookPrefill = '';
try {
  const handoff = sessionStorage.getItem('fsai_first_look_handoff');
  sessionStorage.removeItem('fsai_first_look_handoff');
  firstLookPrefill = normalizeAuditTarget(handoff)?.url || '';
} catch {
  // The manual first-look form remains available when browser storage is blocked.
}
let state = { stage: 'choose', mode: null, goal: '', auditTarget: null, goalConfirmed: false, answers: {}, qIndex: 0, acceptedRecommendations: [], openRecommendations: [], recommendationChanges: {}, editingRecommendation: null, originUnsure: false };
let publicScan = { status: 'idle', result: null, error: null };
let roastRequest = { requestId: crypto.randomUUID(), email: '', receipt: null, sending: false };
let setupRequest = { requestId: crypto.randomUUID(), receipt: null, sending: false };
function resetSetupRequestOnChange() {
  if (setupRequest.receipt || setupRequest.sending) setupRequest = { requestId: crypto.randomUUID(), receipt: null, sending: false };
}
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
  state = structuredClone(snapshots.get(event.state?.osPreviewKey) || { stage: 'choose', mode: null, goal: '', auditTarget: null, goalConfirmed: false, answers: {}, qIndex: 0, acceptedRecommendations: [], openRecommendations: [], recommendationChanges: {}, editingRecommendation: null, originUnsure: false });
  render(true);
});

const btn = (label, action, kind = 'primary', extra = '') => `<button type="button" class="action-button ${kind}" data-action="${action}" ${extra}>${label}</button>`;
function narrativeNumber() {
  if (state.stage === 'choose') return 1;
  if (state.stage === 'audit-request') return 2;
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
  if (roastRequest.receipt && roastRequest.target) return `${heading('01', 'PUBLIC FIRST LOOK', 'Your first look is saved.', 'Return to the public scan or explore a possible OS setup for this build.')}
    <div class="audit-target-form"><span class="form-step">REQUEST SAVED</span><p class="audit-target-value">${escapeHtml(roastRequest.target.url)}</p><div class="stage-actions">${btn('Return to your scan', 'return-to-first-look')}${btn('Explore OS setup', 'start-os-setup', 'secondary')}${btn('Start another first look', 'new-first-look', 'secondary')}</div></div>`;
  const firstLook = roastRequest.email ? `<form id="audit-target-form" class="audit-target-form"><span class="form-step">02 / PUBLIC LINK</span><h3>What should we look at?</h3><p>Your email has not been saved yet. We save your request before scanning this public link.</p><label class="field-label" for="audit-target-input">Website or GitHub repository</label><div class="audit-target-row"><input id="audit-target-input" name="target" type="text" inputmode="url" autocomplete="url" required spellcheck="false" placeholder="yourwebsite.com or github.com/you/project" value="${escapeHtml(firstLookPrefill)}" aria-describedby="audit-target-help" /><button type="submit" class="action-button primary">Save & scan ↗</button></div><p id="audit-target-help">Public HTML or GitHub metadata only. No private access or account is requested.</p><p id="first-look-status" role="status" aria-live="polite"></p><button type="button" class="edit-first-look" data-action="edit-first-look-email">Change email</button></form>` : `<form id="first-look-email-form" class="audit-target-form"><span class="form-step">01 / EMAIL</span><h3>Start with your email.</h3><p>Then add a public website or GitHub link for a live first look and a free, evidence-backed roast.</p><label class="field-label" for="first-look-email">Email address</label><input id="first-look-email" name="email" type="email" autocomplete="email" maxlength="254" required /><label class="roast-consent" for="first-look-consent"><input id="first-look-consent" name="consent" type="checkbox" required /><span>I agree to share my email and public link with 1stStep.ai for follow-up about this first look. This consent alone does not subscribe me to marketing. See the <a href="/privacy.html">privacy policy</a>.</span></label><label class="roast-consent optional-marketing" for="first-look-marketing"><input id="first-look-marketing" name="marketing" type="checkbox" /><span>Optional: Email me occasional 1stStep.ai updates about AI engineering and business systems. I can unsubscribe at any time. This choice is separate from my first-look request.</span></label><button type="submit" class="action-button primary">Continue to public link ↗</button><p>Email is saved only when you submit your link. If saving fails, no scan runs.</p></form>`;
  return `${heading('01', 'FREE PUBLIC FIRST LOOK', 'A useful first look.', 'Give us your email first, then a public link. We show only findings supported by the public response. No questionnaire required.')}
    ${firstLook}
    <div class="setup-alternative"><span>ALREADY KNOW YOU WANT HELP WITH THE BUILD?</span><p>Skip the public first look. Tell us what you are building and see a proposed OS setup path.</p>${btn('Explore OS setup instead', 'start-os-setup', 'secondary')}</div>
    <details class="other-paths" open><summary>Or choose one of five starting paths</summary><div class="path-options" role="group" aria-label="Choose a starting path">${Object.entries(modes).map(([key, mode], i) => `<button type="button" class="path-option" data-action="select-mode" data-mode="${key}"><span class="path-index">0${i + 1}</span><span><strong>${escapeHtml(mode.title)}</strong><small>${escapeHtml(mode.description)}</small></span><b aria-hidden="true">↗</b></button>`).join('')}</div></details>
    <p class="stage-disclaimer">No account or OS project is created. This first look is narrower than a connected project audit.</p>`;
}

function renderAuditRequest() {
  const target = state.auditTarget;
  const label = target.kind === 'github' ? 'GitHub repository' : 'Website';
  const deepAuditBody = `I saw the public first look for this ${label.toLowerCase()}:\n${target.url}\n\nFirst-look reference: ${roastRequest.receipt || 'not saved'}\n\nI would like to discuss a deeper project audit. My main concern is: `;
  const fallbackBody = `I would like help reviewing this public ${label.toLowerCase()}:\n${target.url}\n\nWhat I most want to understand: `;
  const deepAuditHref = `mailto:evan@1ststep.ai?subject=${encodeURIComponent('1stStep OS deeper audit inquiry')}&body=${encodeURIComponent(deepAuditBody)}`;
  const fallbackHref = `mailto:evan@1ststep.ai?subject=${encodeURIComponent('1stStep OS first-look help')}&body=${encodeURIComponent(fallbackBody)}`;
  const result = publicScan.result;
  const roast = result && roastRequest.receipt ? buildPublicRoast(result) : null;
  const roastOutput = roast ? `<div class="roast-result"><div class="scan-result-head"><span>YOUR FREE ROAST / PUBLIC EVIDENCE</span>${stateTag('FIRST LOOK')}</div><h3 tabindex="-1">${escapeHtml(roast.headline)}</h3><div class="roast-columns"><div><span>WHAT IS WORKING</span>${roast.strengths.length ? roast.strengths.map((item) => `<p><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.evidence)}</small></p>`).join('') : '<p>Nothing confirmed yet from the checks we ran.</p>'}</div><div><span>WHAT NEEDS ATTENTION</span>${roast.improvements.length ? roast.improvements.map((item) => `<p><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.action)}</small></p>`).join('') : '<p>No clear miss in the public basics we checked.</p>'}</div></div><div class="scan-next"><span>${roast.improvements.length ? 'FIX THIS FIRST' : 'YOUR NEXT STEP'}</span><strong>${escapeHtml(roast.nextStep)}</strong></div><p class="scan-note">${escapeHtml(roast.limit)}</p><p class="roast-receipt">Email saved for this first-look follow-up. Reference: ${escapeHtml(roastRequest.receipt)}. The roast is shown here; no report email was sent.</p></div>` : '';
  const output = publicScan.status === 'loading' ? '<div class="scan-loading" role="status"><span class="scan-pulse" aria-hidden="true"></span><strong>Checking the public source…</strong><p>Fetching the link and recording only what the response verifies.</p></div>'
    : publicScan.status === 'done' && result ? `<div class="scan-result ${roastRequest.receipt ? 'is-compact' : ''}"><div class="scan-result-head"><span>PUBLIC FIRST LOOK / ${escapeHtml(result.source)}</span>${stateTag('EVIDENCE FOUND')}</div><h3>${roastRequest.receipt ? 'Scan complete.' : 'Here is what we found.'}</h3><p class="scan-source">Inspected <a href="${escapeHtml(result.inspectedUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(result.inspectedUrl)}</a> · ${escapeHtml(new Date(result.checkedAt).toLocaleString())}</p>${roastRequest.receipt ? '<details><summary>Review scan evidence</summary>' : ''}<div class="scan-checks">${result.checks.map((check) => `<div class="scan-check"><div><strong>${escapeHtml(check.label)}</strong>${stateTag(check.status)}</div><p>${escapeHtml(check.evidence)}</p></div>`).join('')}</div>${roastRequest.receipt ? '</details>' : `<div class="scan-next"><span>YOUR FIRST NEXT STEP</span><strong>${escapeHtml(result.nextStep)}</strong></div><p class="scan-note">${escapeHtml(result.note)}</p>`}</div>`
    : publicScan.status === 'error' ? `<div class="scan-error" role="alert"><strong>We couldn't verify this link right now.</strong><p>${escapeHtml(publicScan.error)} No findings were generated.</p></div>` : '';
  return `${heading('02', 'PUBLIC FIRST LOOK', 'Your link. Real evidence.', 'We only report signals we can verify from a public response. This is not a full project, security, or release audit.')}
    <div class="interpretation-card"><span>YOUR ${label.toUpperCase()} / USER PROVIDED</span><strong class="audit-target-value">${escapeHtml(target.url)}</strong></div>
    <div id="scan-output" aria-live="polite">${output}</div>${roastOutput}
    ${roast ? '<p class="stage-disclaimer">Want to go beyond public signals? A deeper project audit can be scoped around your code, tests, accessibility, security, and release risks where access and evidence allow. We agree the scope and any fee before work or model usage begins.</p>' : ''}
    <div class="stage-actions">${publicScan.status === 'error' ? btn('Try the scan again', 'retry-scan') : ''}${roast ? `<a class="action-button primary" href="${deepAuditHref}" data-fsai-event="os_deeper_audit_email_opened" data-fsai-placement="audit_request">Ask about a deeper audit ↗</a>${btn('Explore OS setup instead', 'start-os-setup', 'secondary')}` : publicScan.status === 'error' ? `<a class="action-button secondary" href="${fallbackHref}" data-fsai-event="os_first_look_email_opened" data-fsai-placement="audit_request">Request help ↗</a>${btn('Explore OS setup instead', 'start-os-setup', 'secondary')}` : ''}</div>
    ${roastRequest.receipt || publicScan.status === 'error' ? '<p class="stage-disclaimer">This opens an email draft; nothing is sent until you send it. No private repository is connected or saved by this first look.</p>' : ''}`;
}

async function submitFirstLookTarget(form, auditTarget) {
  if (roastRequest.sending || roastRequest.receipt || !roastRequest.email || !form.reportValidity()) return;
  const targetUrl = auditTarget.url;
  if (roastRequest.attemptedTarget && roastRequest.attemptedTarget !== targetUrl) roastRequest.requestId = crypto.randomUUID();
  roastRequest.attemptedTarget = targetUrl;
  roastRequest.sending = true;
  const requestId = roastRequest.requestId;
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('#first-look-status');
  button.disabled = true;
  form.elements.target.disabled = true;
  form.querySelector('.edit-first-look').disabled = true;
  status.textContent = 'Saving your request before the scan…';
  try {
    const response = await fetch('/api/os-roast-intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestId, email: roastRequest.email, consent: true, marketing_opt_in: roastRequest.marketingOptIn === true, target: targetUrl }), signal: AbortSignal.timeout(10000) });
    const payload = await response.json().catch(() => ({}));
    if (roastRequest.requestId !== requestId) return;
    if (!response.ok || !payload.ok || !payload.persisted || payload.request_id !== requestId) throw new Error(payload.message || 'We could not confirm your request. Please try again.');
    roastRequest.receipt = payload.request_id;
    roastRequest.target = auditTarget;
    track('os_roast_request_persisted', { kind: auditTarget.kind });
    track('os_first_look_target_entered', { kind: auditTarget.kind });
    firstLookPrefill = '';
    if (state.stage === 'choose') {
      go('audit-request', { auditTarget });
      runPublicScan();
    }
  } catch (error) {
    if (roastRequest.requestId !== requestId) return;
    status.textContent = error.name === 'TimeoutError' ? 'The save timed out. No scan ran. Please try again.' : error.message || 'We could not save your request. No scan ran. Please try again.';
    status.dataset.state = 'error';
    button.disabled = false;
    form.elements.target.disabled = false;
    form.querySelector('.edit-first-look').disabled = false;
  } finally {
    if (roastRequest.requestId === requestId) roastRequest.sending = false;
  }
}

async function submitOsSetup(form) {
  if (setupRequest.sending || setupRequest.receipt || !form.reportValidity()) return;
  const requestId = setupRequest.requestId;
  const status = form.querySelector('#os-setup-status');
  const button = form.querySelector('button[type="submit"]');
  setupRequest.sending = true;
  button.disabled = true;
  status.textContent = 'Saving your OS setup request…';
  try {
    const response = await fetch('/api/os-setup-intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestId, email: form.elements.email.value, consent: form.elements.consent.checked, goal: state.goal, answers: state.answers, target: state.auditTarget?.url || null, first_look_request_id: state.auditTarget ? roastRequest.receipt : null }), signal: AbortSignal.timeout(10000) });
    const payload = await response.json().catch(() => ({}));
    if (setupRequest.requestId !== requestId) return;
    if (!response.ok || !payload.ok || !payload.persisted || payload.request_id !== requestId) throw new Error(payload.message || 'We could not confirm your request. Please try again.');
    setupRequest.receipt = payload.request_id;
    track('os_setup_request_persisted', { from_first_look: Boolean(state.auditTarget) });
    render();
  } catch (error) {
    if (setupRequest.requestId !== requestId) return;
    status.textContent = error.name === 'TimeoutError' ? 'Saving took too long. Please retry; the same request will not be duplicated.' : error.message || 'We could not save your request. Please try again.';
    status.dataset.state = 'error';
    button.disabled = false;
  } finally {
    if (setupRequest.requestId === requestId) setupRequest.sending = false;
  }
}

async function runPublicScan() {
  if (!state.auditTarget || !roastRequest.receipt) return;
  publicScan = { status: 'loading', result: null, error: null };
  render();
  const target = state.auditTarget.url;
  try {
    const response = await fetch('/api/os-public-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: target }), signal: AbortSignal.timeout(12000) });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(({ RATE_LIMITED: 'Too many scans from this connection. Please try later.', PUBLIC_REPOSITORY_NOT_FOUND: 'That repository is not publicly available.', INVALID_TARGET: 'Enter an HTTPS public website or GitHub repository.', TARGET_TIMEOUT: 'The public source timed out.', RESPONSE_TOO_LARGE: 'The public page exceeded the first-look size limit.' })[payload.error] || 'The public source could not be inspected.');
    if (state.auditTarget?.url !== target) return;
    publicScan = { status: 'done', result: payload.result, error: null };
    track('os_public_scan_completed', { kind: payload.result.kind });
  } catch (error) {
    if (state.auditTarget?.url !== target) return;
    publicScan = { status: 'error', result: null, error: error.name === 'TimeoutError' ? 'The scan timed out.' : error.message };
    track('os_public_scan_unavailable', { kind: state.auditTarget.kind });
  }
  if (state.stage === 'audit-request') render();
}

function renderDescribe() {
  const prompts = {
    idea: ['What do you want to build?', 'Explain it however you would to a friend.', 'I want to build something that helps…'],
    existing: ['Tell us about the build.', 'What exists, and what do you want to understand or fix?', 'I have a prototype, and I need to know…'],
    business: ['Tell us about your business.', 'What work or bottleneck brought you here?', 'My team spends time each week on…'],
    growth: ['What have you built?', 'Tell us what people should discover and what feels stuck.', 'We built a product for…'],
    unsure: ["That's fine. What are you trying to accomplish?", 'Use your own words. A simple rule will suggest a starting path for you to confirm.', 'I am trying to…'],
  }[state.mode];
  return `${heading('02', 'DESCRIBE THE GOAL', prompts[0], prompts[1])}${state.auditTarget ? `<p class="stage-disclaimer">Continuing from your public link: ${escapeHtml(state.auditTarget.url)}. This intake uses your answers; no code or private project data was inspected.</p>` : ''}<form id="goal-form"><label class="field-label" for="goal-input">Your ${modes[state.mode].noun} or current challenge</label><textarea id="goal-input" name="goal" required minlength="8" maxlength="800" rows="7" placeholder="${prompts[2]}">${escapeHtml(state.goal)}</textarea><div class="field-foot"><span>8–800 characters · ${state.mode === 'existing' ? 'saved only if you submit the OS setup request' : 'never submitted'}</span><span id="char-count">${state.goal.length} / 800</span></div><div class="stage-actions"><button type="submit" class="action-button primary">See what 1stStep understands <span aria-hidden="true">↗</span></button></div></form>`;
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
  return `${heading('04', 'CONNECT YOUR PROJECT', 'Read first. Write later.', 'A future baseline will begin with the exact repository and commit. No repository connector or code scan runs in this intake preview.')}
    <div class="connector-list"><div><strong>GitHub</strong>${stateTag('PLANNED')}<small>Read-only connection is not available here.</small></div><div><strong>Upload an archive</strong>${stateTag('PLANNED')}<small>No file leaves this page because upload is not implemented.</small></div><div><strong>Another provider</strong>${stateTag('PLANNED')}<small>A future adapter would need a separate permission review.</small></div><div><strong>I can't share code</strong>${stateTag('AVAILABLE')}<small>Continue with a self-reported project profile.</small></div></div>
    <div class="connection-plan" aria-label="Planned connection sequence, not performed"><span>REPOSITORY <small>NOT CONNECTED</small></span><i aria-hidden="true">→</i><span>FILES <small>NOT READ</small></span><i aria-hidden="true">→</i><span>STACK <small>UNKNOWN</small></span><i aria-hidden="true">→</i><span>BASELINE <small>NOT PINNED</small></span></div>
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
    <div class="role-preview"><span>PROPOSED CORE ROLES / NOT RUNNING</span><div><strong>Lead Engineer</strong>${stateTag('PLANNED')}<small>Owns scoped implementation and deterministic verification.</small></div><div><strong>Independent Auditor</strong>${stateTag('PLANNED')}<small>Challenges milestone evidence separately from implementation.</small></div><p>No specialist agent is assigned from these answers alone.</p></div>
    <div class="file-preview"><span>PROPOSED ARTIFACTS / NOT GENERATED</span>${files.map((file) => `<div><b>⌁</b><strong>${file}</strong>${stateTag('PLANNED')}</div>`).join('')}</div>
    ${state.mode === 'existing' ? '<p class="stage-disclaimer">Readiness remains unassessed. A future connected audit must verify evidence before any finding or score.</p>' : '<p class="stage-disclaimer">The project chooses the OS. Dormant areas can activate when later answers or evidence justify them.</p>'}
    <div class="stage-actions">${btn('How can I continue?', 'to-continue')}</div>`;
}

function renderContinue() {
  const setupBody = [
    'I completed the 1stStep OS setup preview and would like to discuss a scoped setup.',
    roastRequest.receipt && state.auditTarget ? `Public first-look reference: ${roastRequest.receipt}` : null,
    state.auditTarget ? `Public link: ${state.auditTarget.url}` : null,
    `Starting path: ${modes[state.mode].short}`,
    `My goal: ${state.goal}`,
    ...Object.entries(state.answers).map(([key, value]) => `${key}: ${value}`),
  ].filter(Boolean).join('\n\n');
  const setupHref = `mailto:evan@1ststep.ai?subject=${encodeURIComponent('1stStep OS setup inquiry')}&body=${encodeURIComponent(setupBody)}`;
  const setupContact = setupRequest.receipt
    ? `<div class="setup-alternative" role="status"><span>OS SETUP INQUIRY SAVED</span><p>We received your request for a scoped OS setup conversation. Reference: ${escapeHtml(setupRequest.receipt)}. No Project OS, account, payment, or agent run was started.</p></div>`
    : `<form id="os-setup-form" class="audit-target-form"><span class="form-step">REQUEST A SCOPED OS SETUP</span><p>Send your goal and four project answers for a human scope review. No repository access, setup, model work, or payment begins from this request.</p><label class="field-label" for="os-setup-email">Email address</label><input id="os-setup-email" name="email" type="email" autocomplete="email" maxlength="254" value="${escapeHtml(roastRequest.email)}" required /><label class="roast-consent" for="os-setup-consent"><input id="os-setup-consent" name="consent" type="checkbox" required /><span>I agree to send my email, goal, project answers, and any public link to 1stStep.ai for follow-up about OS setup. This does not subscribe me to marketing. See the <a href="/privacy.html">privacy policy</a>.</span></label><button type="submit" class="action-button primary">Request OS setup review ↗</button><p id="os-setup-status" role="status" aria-live="polite"></p></form>`;
  return `${heading('11', 'THE NEXT STEP', state.mode === 'existing' ? "Let's scope your OS setup." : 'Use the AI you already have.', state.mode === 'existing' ? 'Your answers point to a possible way forward. Talk with us about the work, access, and controls your project actually needs before any setup begins.' : 'The preview can show a direction today. Export, provider handoff, repository connection, and saving a Project OS need later product work.')}
    ${state.mode === 'existing' ? '' : `<div class="provider-grid"><div><strong>Claude Code</strong>${stateTag('PLANNED')}<small>Provider workflow not connected.</small></div><div><strong>Codex</strong>${stateTag('PLANNED')}<small>Provider workflow not connected.</small></div><div><strong>Other AI</strong>${stateTag('PLANNED')}<small>Provider-neutral handoff intended.</small></div><div><strong>Download Project OS</strong>${stateTag('PLANNED')}<small>No files were compiled.</small></div></div>`}
    <div class="outcome-card"><span>GOAL → ROUTE → NEXT STEP</span><strong>${escapeHtml(modes[state.mode].short)}</strong><p>${escapeHtml(state.goal)}</p><small>${setupRequest.receipt ? 'Your submitted answers were saved for a scoped review.' : 'Preview complete. Your answers will disappear on reload unless you submit a request.'}</small></div>
    ${state.mode === 'existing' ? '<div class="setup-alternative"><span>WHAT A SCOPED OS SETUP CAN INCLUDE</span><p>A verified project baseline, a prioritized engineering plan, and the checks and agent roles needed to build and release safely. We review your project before recommending a scope or fee.</p></div>' : ''}
    ${state.mode === 'existing' ? setupContact : ''}
    <div class="stage-actions">${state.mode === 'existing' && !setupRequest.receipt ? `<a class="action-button secondary" href="${setupHref}" data-fsai-event="os_setup_inquiry_email_opened" data-fsai-placement="end">Use an email draft instead ↗</a>` : state.mode !== 'existing' ? `<a class="action-button primary" href="/journey/" data-fsai-event="os_preview_journey_click" data-fsai-placement="end">Talk through your project ↗</a>` : ''}<a class="action-button secondary" href="/os">Explore 1stStep OS</a></div><p class="stage-disclaimer">${state.mode === 'existing' ? setupRequest.receipt ? 'Scope and pricing still require agreement.' : 'The email alternative opens a draft containing your answers for your review; opening it is not a saved request. Scope and pricing still require agreement.' : 'Begin Your Journey is the existing consultancy path. It does not save this preview or create an OS account.'}</p>`;
}

function renderConversation() {
  switch (state.stage) {
    case 'choose': return renderChoose();
    case 'audit-request': return renderAuditRequest();
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
  if (state.stage === 'choose') return `<div class="system-intro"><div class="signal-route"><span class="signal-node is-active">STARTING POINT</span><i></i><span class="signal-node">INTELLIGENT ROUTE</span><i></i><span class="signal-node">NEXT STEP</span></div><h2 id="system-title">One link.<br /><em>A clearer path.</em></h2><p>Share a public link for a live first look, or choose a starting path to explore how the Project OS could take shape.</p><div class="system-empty">PROJECT STATE <b>WAITING FOR YOUR CHOICE</b></div></div>`;
  if (state.stage === 'audit-request') return `<div class="system-intro"><div class="signal-route"><span class="signal-node is-active">PUBLIC LINK</span><i></i><span class="signal-node ${publicScan.status === 'done' ? 'is-active' : ''}">VISIBLE SIGNALS</span><i></i><span class="signal-node ${roastRequest.receipt ? 'is-active' : ''}">NEXT STEP</span></div><h2 id="system-title">A useful first look.<br /><em>No invented score.</em></h2><p>We check public evidence only. A full technical audit still needs a pinned baseline, appropriate permission, and deeper verification.</p><div class="system-empty">PUBLIC SCAN <b>${publicScan.status === 'done' ? 'COMPLETE' : publicScan.status === 'loading' ? 'RUNNING' : publicScan.status === 'error' ? 'UNAVAILABLE' : 'NOT STARTED'}</b></div><div class="system-empty">PROJECT AUDIT <b>NOT STARTED</b></div></div>`;
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
    : state.mode === 'existing' ? `<div class="mode-state"><span>REPOSITORY BASELINE</span><div class="baseline-mini"><strong>Not connected</strong>${stateTag('UNVERIFIED')}</div><small>No code, pinned commit, or private repository data has been inspected.</small></div>` : '';
  const mobileNext = state.stage === 'questions' ? `<div class="mobile-next-action">${btn(state.qIndex === questions[state.mode].length - 1 ? (state.mode === 'existing' ? 'View the unverified baseline' : 'See preliminary recommendations') : 'Next question', 'next-question', 'primary', currentAnswer ? '' : 'disabled')}</div>` : '';
  return `<div class="system-heading"><p>PROJECT STATE / ${escapeHtml(modes[state.mode]?.short || 'FINDING PATH')}</p><h2 id="system-title">The system is <em>learning your project.</em></h2><small>${filled} of 12 signals have a preliminary value</small></div>${response}${modeView}
    <div class="signal-highlights" aria-label="Recently resolved project signals">${resolved.map(([key, signal]) => `<div><span>${escapeHtml(key)}</span><strong>${escapeHtml(signal.value)}</strong>${stateTag(signal.state)}</div>`).join('')}</div>
    <details class="genome-live" ${window.matchMedia('(max-width: 650px)').matches ? '' : 'open'}><summary class="module-head"><span>PROJECT GENOME <small class="genome-expand-label">/ SHOW ALL SIGNALS</small></span>${stateTag('PREVIEW')}</summary><dl>${Object.entries(genome).map(([key, signal]) => `<div class="genome-row"><dt>${escapeHtml(key)}</dt><dd><span>${escapeHtml(signal.value)}</span>${stateTag(signal.state)}</dd></div>`).join('')}</dl></details>
    <div class="capabilities-live"><div class="module-head"><span>CAPABILITY ACTIVATION</span><small>${active.size} ACTIVE · ${capabilityNames.length - active.size} DORMANT</small></div><div class="capability-grid">${capabilityNames.map((name) => `<span class="${active.has(name) ? 'is-active' : ''}"><i></i>${name}</span>`).join('')}</div><p>Active means relevant to this preview, not that an agent is running.</p></div>${mobileNext}`;
}

function progressValue() {
  const map = { choose: 0, 'audit-request': 10, describe: 12, route: 18, interpret: 23, connect: 31, questions: 35, baseline: 70, recommend: 76, reveal: 90, continue: 100 };
  if (state.stage === 'questions') return 35 + Math.round(((state.qIndex + (state.answers[questions[state.mode][state.qIndex].key] ? 1 : 0)) / questions[state.mode].length) * 34);
  return map[state.stage] ?? 0;
}

function render(focus = false) {
  document.body.classList.toggle('is-in-flow', state.stage !== 'choose');
  conversation.innerHTML = renderConversation();
  system.innerHTML = renderSystem();
  document.querySelector('#privacy-note').textContent = setupRequest.receipt ? 'Your consented OS setup inquiry is retained for 90 days. No account or OS project was created.' : roastRequest.receipt ? 'A submitted first-look email and public link are retained for 90 days. Project answers stay in this tab unless you submit an OS setup request. No account or OS project is created.' : 'Your answers stay in this tab and disappear on reload unless you submit an OS setup request. No account or OS project is created.';
  document.querySelector('.system-panel').classList.remove('is-updated');
  requestAnimationFrame(() => document.querySelector('.system-panel').classList.add('is-updated'));
  const percent = progressValue();
  progressTrack.setAttribute('aria-valuenow', String(percent));
  progressFill.style.width = `${percent}%`;
  progressLabel.textContent = state.stage === 'questions' ? `QUESTION ${state.qIndex + 1} / ${questions[state.mode].length}` : state.stage === 'audit-request' ? '02 / PUBLIC SCAN' : `${String(narrativeNumber()).padStart(2, '0')} / ${state.stage.toUpperCase()}`;
  document.querySelector('.preview-pill').textContent = state.stage === 'audit-request' ? 'LIVE PUBLIC FIRST LOOK' : 'PREVIEW ONLY';
  stageNumber.textContent = state.stage === 'audit-request' ? '02 / PUBLIC SCAN' : `${String(narrativeNumber()).padStart(2, '0')} / ${state.stage.toUpperCase()}`;
  systemStatus.textContent = state.stage === 'choose' ? 'WAITING FOR A START' : state.stage === 'audit-request' ? `PUBLIC SCAN ${publicScan.status.toUpperCase()}` : state.stage === 'continue' ? 'PREVIEW COMPLETE' : 'STATE UPDATED';
  backButton.hidden = state.stage === 'choose';
  announcement.textContent = state.stage === 'questions' && state.answers[questions[state.mode][state.qIndex].key] ? 'Project state updated from your answer.' : `Now showing ${state.stage === 'questions' ? 'question ' + (state.qIndex + 1) : state.stage}.`;
  if (focus) {
    document.querySelector('#stage-title')?.focus({ preventScroll: true });
    document.querySelector('.stage-layout')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

conversation.addEventListener('input', (event) => {
  if (event.target.id === 'audit-target-input') event.target.setCustomValidity('');
  if (event.target.id === 'goal-input') {
    const count = document.querySelector('#char-count');
    if (count) count.textContent = `${event.target.value.length} / 800`;
  }
});

conversation.addEventListener('submit', (event) => {
  if (event.target.id === 'os-setup-form') {
    event.preventDefault();
    submitOsSetup(event.target);
    return;
  }
  if (event.target.id === 'first-look-email-form') {
    event.preventDefault();
    if (!event.target.reportValidity()) return;
    roastRequest.email = event.target.elements.email.value.trim();
    roastRequest.marketingOptIn = event.target.elements.marketing.checked;
    render();
    document.querySelector('#audit-target-input')?.focus();
    return;
  }
  if (event.target.id === 'audit-target-form') {
    event.preventDefault();
    const input = event.target.elements.target;
    const auditTarget = normalizeAuditTarget(input.value);
    if (!auditTarget) { input.setCustomValidity('Enter a public website or GitHub repository URL.'); input.reportValidity(); return; }
    submitFirstLookTarget(event.target, auditTarget);
    return;
  }
  if (event.target.id !== 'goal-form') return;
  event.preventDefault();
  const goal = event.target.goal.value.trim();
  if (goal.length < 8) { event.target.goal.setCustomValidity('Please add at least 8 characters.'); event.target.goal.reportValidity(); return; }
  event.target.goal.setCustomValidity('');
  if (state.goal !== goal) {
    resetSetupRequestOnChange();
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
  if (action === 'return-to-first-look' && roastRequest.target) {
    go('audit-request', { auditTarget: roastRequest.target });
  } else if (action === 'new-first-look') {
    roastRequest = { requestId: crypto.randomUUID(), email: '', receipt: null, sending: false };
    publicScan = { status: 'idle', result: null, error: null };
    render();
    document.querySelector('#first-look-email')?.focus();
  } else if (action === 'retry-scan') {
    runPublicScan();
  } else if (action === 'edit-first-look-email') {
    if (roastRequest.sending) return;
    roastRequest = { requestId: crypto.randomUUID(), email: '', receipt: null, sending: false };
    render();
    document.querySelector('#first-look-email')?.focus();
  } else if (action === 'select-mode' || action === 'start-os-setup') {
    const mode = action === 'start-os-setup' ? 'existing' : target.dataset.mode;
    if (!modes[mode]) return;
    const fromFirstLook = action === 'start-os-setup' && Boolean(roastRequest.receipt && roastRequest.target);
    setupRequest = { requestId: crypto.randomUUID(), receipt: null, sending: false };
    go('describe', { mode, goal: '', auditTarget: fromFirstLook ? roastRequest.target : null, goalConfirmed: false, answers: {}, qIndex: 0, acceptedRecommendations: [], openRecommendations: [], recommendationChanges: {}, editingRecommendation: null, originUnsure: mode === 'unsure' });
    track('os_onboarding_started', { mode });
    track('os_start_mode_selected', { mode, via: action === 'start-os-setup' ? fromFirstLook ? 'public_first_look' : 'skip_first_look' : 'starting_paths' });
    if (action === 'start-os-setup') track('os_setup_intake_started', { from_first_look: fromFirstLook });
    if (mode === 'business') track('os_business_flow_started', { mode });
    if (mode === 'growth') track('os_discovery_flow_started', { mode });
  } else if (action === 'route-mode') {
    if (state.mode !== target.dataset.mode) {
      resetSetupRequestOnChange();
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
    if (state.answers[question.key] !== target.dataset.answer) {
      resetSetupRequestOnChange();
      clearDownstreamDecisions();
    }
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
