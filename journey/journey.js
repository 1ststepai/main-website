const form = document.querySelector('#journey-form');
const steps = [...form.querySelectorAll('.step')];
const result = document.querySelector('#result');
const error = document.querySelector('#step-error');
const next = document.querySelector('#next-button');
const back = document.querySelector('#back-button');
const label = document.querySelector('#step-label');
const progress = document.querySelector('#progress-fill');
let current = 0;
let summaryText = '';
let started = false;
const savedKey = 'firststepJourneyDiagnosisV1';
let requestId = crypto.randomUUID();
let savedReceipt = '';
let currentAnswers = '';
const requestedIntent = /(?:^|[?&])intent=ai-operations-audit(?:&|$)/.test(globalThis.location?.search || '') ? 'ai-operations-audit' : '';
const intent = requestedIntent === 'ai-operations-audit' ? requestedIntent : '';
const intentBanner = document.querySelector('#journey-intent');
if (intent) {
  intentBanner.hidden = false;
  window.addEventListener('load', () => window.fsaiTrack?.('ai_operations_audit_intent_selected'), { once: true });
}

function savedState() {
  try { return JSON.parse(localStorage.getItem(savedKey) || 'null'); } catch { return null; }
}

function persistState() {
  try { localStorage.setItem(savedKey, JSON.stringify({ intent, answers: JSON.parse(currentAnswers), request_id: requestId, receipt: savedReceipt })); } catch { /* Browser storage can be disabled. */ }
}

function showReceipt() {
  const status = document.querySelector('#request-status');
  const button = document.querySelector('#request-button');
  const email = document.querySelector('#request-email');
  const consent = document.querySelector('#request-consent');
  if (savedReceipt) {
    status.textContent = `Request received. Reference: ${savedReceipt}. We will follow up by email.`;
    status.dataset.state = 'success';
    button.disabled = true;
    email.disabled = true;
    consent.disabled = true;
  } else {
    status.textContent = '';
    delete status.dataset.state;
    button.disabled = false;
    email.disabled = false;
    consent.disabled = false;
  }
}

const actions = {
  capture: ['Trace every entry point', 'List each form, ad, calendar, and inbound channel. Verify where the lead is recorded and who sees it first.'],
  qualification: ['Define a useful qualification rule', 'Agree on the context that changes priority, then make it visible before the next handoff.'],
  routing: ['Make ownership explicit', 'Map the handoff from first contact to the responsible person, including an exception path when nobody responds.'],
  followup: ['Inspect the follow-up window', 'Check actual response timing and the events that should create a task, reminder, or approved message.'],
  reporting: ['Reconcile the source of truth', 'Pick one conversion journey and trace source, CRM record, activity, and outcome before expanding the dashboard.'],
  manual: ['Identify the repeated handoff', 'Choose one high-frequency transfer, document its inputs and exceptions, then test whether automation is justified.'],
  other: ['Map the workflow before choosing a tool', 'Write down the trigger, people, data, decisions, and desired result so the real constraint becomes visible.'],
};

function showStep(index, focus = true) {
  current = Math.max(0, Math.min(index, steps.length - 1));
  result.hidden = true;
  form.hidden = false;
  steps.forEach((step, position) => { step.hidden = position !== current; });
  label.textContent = `QUESTION ${String(current + 1).padStart(2, '0')} / 06`;
  progress.style.width = `${((current + 1) / steps.length) * 100}%`;
  back.hidden = current === 0;
  next.innerHTML = current === steps.length - 1 ? 'See my diagnosis <span aria-hidden="true">→</span>' : 'Continue <span aria-hidden="true">→</span>';
  error.hidden = true;
  if (focus) steps[current].querySelector('legend')?.setAttribute('tabindex', '-1');
  if (focus) steps[current].querySelector('legend')?.focus();
}

function validStep() {
  const invalid = [...steps[current].querySelectorAll('[required]')].find((field) => !field.value.trim());
  if (!invalid) return true;
  error.textContent = 'Please answer this question before continuing.';
  error.hidden = false;
  invalid.focus();
  return false;
}

function selectedText(name) {
  const select = form.elements[name];
  return select.selectedOptions[0]?.textContent || '';
}

function buildDiagnosis(restored = false) {
  const data = new FormData(form);
  const answers = Object.fromEntries(data.entries());
  const serializedAnswers = JSON.stringify(answers);
  if (serializedAnswers !== currentAnswers) {
    requestId = crypto.randomUUID();
    savedReceipt = '';
    currentAnswers = serializedAnswers;
  }
  persistState();
  showReceipt();
  const answer = (name) => String(data.get(name) || '').trim();
  const demand = answer('demand');
  const bottleneck = answer('bottleneck');
  const fields = [
    ['Business', answer('business')],
    ['Current demand', selectedText('demand')],
    ['Goal', answer('goal')],
    ['Current stack', answer('stack')],
    ['Primary bottleneck', selectedText('bottleneck')],
    ['What happens', answer('bottleneck_detail')],
    ['90-day outcome', answer('outcome')],
    ['Team', selectedText('team')],
    ['Timing', answer('timing') ? selectedText('timing') : 'Not specified'],
  ].filter(([, value]) => value);

  const fit = demand === 'existing'
    ? ['Potential systems fit', 'You report existing customers or leads and an operational bottleneck. A live system review is still needed before scope or fit can be confirmed.']
    : demand === 'early'
      ? ['Scope carefully', 'There is some early interest. Confirm the offer and the most important handoff before investing in a larger system build.']
      : ['Validate demand first', 'Without demand yet, a revenue-system build may be premature. Start by testing the offer and how prospects respond.'];
  const recommendation = demand === 'none'
    ? ['Test the offer and capture path', 'Talk to prospective customers, record what they ask for, and use a simple lead-capture path before adding complex automation.']
    : actions[bottleneck] || actions.other;

  document.querySelector('#fit-signal').textContent = fit[0];
  document.querySelector('#fit-reason').textContent = fit[1];
  document.querySelector('#recommendation-title').textContent = recommendation[0];
  document.querySelector('#recommendation-copy').textContent = recommendation[1];
  const details = document.querySelector('#result-details');
  details.replaceChildren(...fields.map(([name, value]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = name;
    dd.textContent = value;
    row.append(dt, dd);
    return row;
  }));
  summaryText = `1stStep.ai first-pass systems diagnosis\n\n${fields.map(([name, value]) => `${name}: ${value}`).join('\n')}\n\nInitial fit signal: ${fit[0]} — ${fit[1]}\nRecommended first action: ${recommendation[0]} — ${recommendation[1]}\n\nThis is based only on my answers, not a live system audit.`;
  const email = document.querySelector('#email-action');
  const subject = demand === 'none' ? '1stStep next-step question' : '1stStep system audit request';
  const emailBody = summaryText.slice(0, 1750) + (summaryText.length > 1750 ? '\n\n[Summary shortened for email. Full version can be copied from the page.]' : '');
  email.href = `mailto:evan@1ststep.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
  email.textContent = 'Use my email app instead ↗';
  form.hidden = true;
  result.hidden = false;
  label.textContent = 'DIAGNOSIS / YOUR ANSWERS';
  progress.style.width = '100%';
  result.focus();
  if (!restored) window.fsaiTrack?.('journey_diagnosis_view');
}

form.addEventListener('submit', (event) => event.preventDefault());
next.addEventListener('click', () => {
  if (!validStep()) return;
  if (!started) {
    started = true;
    window.fsaiTrack?.('journey_start');
  }
  if (current < steps.length - 1) showStep(current + 1);
  else buildDiagnosis();
});
back.addEventListener('click', () => showStep(current - 1));
document.querySelector('#edit-action').addEventListener('click', () => showStep(0));
document.querySelector('#email-action').addEventListener('click', () => window.fsaiTrack?.('journey_email_open'));
document.querySelector('#clear-action').addEventListener('click', () => {
  try { localStorage.removeItem(savedKey); } catch { /* Browser storage can be disabled. */ }
  form.reset();
  requestId = crypto.randomUUID();
  savedReceipt = '';
  currentAnswers = '';
  showStep(0);
});
document.querySelector('#request-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const requestForm = event.currentTarget;
  if (!requestForm.reportValidity() || savedReceipt) return;
  const status = document.querySelector('#request-status');
  const button = document.querySelector('#request-button');
  button.disabled = true;
  status.textContent = 'Sending your request…';
  delete status.dataset.state;
  const attribution = window.fsaiAttribution?.get() || {};
  try {
    const response = await fetch('/api/journey-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, email: requestForm.elements.email.value, consent: requestForm.elements.consent.checked, intent, answers: JSON.parse(currentAnswers), attribution }),
    });
    const body = await response.json();
    if (!response.ok || !body.ok || !body.persisted || body.request_id !== requestId) throw new Error(body.message || 'We could not confirm your request. Your answers remain here; please try again.');
    savedReceipt = body.request_id;
    persistState();
    showReceipt();
    window.fsaiTrack?.('journey_request_persisted');
    if (intent === 'ai-operations-audit') window.fsaiTrack?.('journey_ai_operations_complete');
  } catch (error) {
    status.textContent = error instanceof SyntaxError ? 'We could not confirm your request. Your answers remain here; please try again.' : (error.message || 'We could not confirm your request. Your answers remain here; please try again.');
    status.dataset.state = 'error';
    button.disabled = false;
  }
});
document.querySelector('#copy-action').addEventListener('click', async () => {
  const status = document.querySelector('#copy-status');
  try {
    await navigator.clipboard.writeText(summaryText);
    status.textContent = 'Diagnosis copied. You can paste it into a message or document.';
  } catch {
    status.textContent = 'Copy was unavailable. You can select the summary above or use the email link.';
  }
  status.hidden = false;
});

showStep(0, false);
const previous = savedState();
if (previous && previous.answers && typeof previous.answers === 'object') {
  for (const [name, value] of Object.entries(previous.answers)) {
    if (form.elements[name] && typeof value === 'string') form.elements[name].value = value;
  }
  if ([...form.querySelectorAll('[required]')].every((field) => field.value.trim())) {
    currentAnswers = JSON.stringify(Object.fromEntries(new FormData(form).entries()));
    if (typeof previous.request_id === 'string') requestId = previous.request_id;
    if (previous.receipt === requestId) savedReceipt = previous.receipt;
    buildDiagnosis(true);
  }
}
