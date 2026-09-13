export const modes = {
  idea: { title: 'I have an idea', description: 'I want to build something new.', short: 'New project', noun: 'project' },
  existing: { title: "I've already started building", description: 'I have code, a prototype, or an existing project.', short: 'Existing build', noun: 'build' },
  business: { title: 'I run a business', description: 'I want to automate repetitive work.', short: 'Business systems', noun: 'business' },
  growth: { title: "I've built it — I need users", description: 'I need help getting discovered and growing.', short: 'Discovery', noun: 'product' },
  unsure: { title: "I'm not sure where to start", description: 'Help me figure it out.', short: 'Find my path', noun: 'goal' },
};

export const capabilityNames = ['Research', 'Product', 'Design', 'Engineering', 'AI', 'Security', 'Business', 'Pricing', 'Media', 'Discovery', 'Growth', 'Sales', 'Automation', 'Operations', 'Recovery', 'Learning'];

export const questions = {
  idea: [
    { key: 'audience', title: 'Who is this for?', detail: 'Start with a real person or group. You can refine this later.', options: ['Consumers', 'Business teams', 'My own team', 'Not sure yet'] },
    { key: 'platform', title: 'Where should it first work?', detail: 'Choose the smallest useful surface. No framework decision needed.', options: ['Web', 'Mobile', 'Web + mobile', 'Recommend for me'] },
    { key: 'accounts', title: 'Will people need accounts?', detail: 'This affects scope, privacy, and security.', options: ['Yes', 'No', 'Not sure yet'] },
    { key: 'data', title: 'Will it handle sensitive information?', detail: 'Think about health, finances, children, identity, or private customer data.', options: ['Yes', 'No', 'Not sure yet'] },
    { key: 'ai', title: 'Is AI essential to the first version?', detail: 'Keep it dormant if a simpler product can prove the goal first.', options: ['Yes, it is central', 'No', 'Not sure yet'] },
    { key: 'launch', title: 'What would a useful first release do?', detail: 'The first outcome is more useful than a feature list.', options: ['Prove the idea', 'Help first users', 'Sell a service', 'Recommend for me'] },
  ],
  existing: [
    { key: 'stage', title: 'How far has the build gone?', detail: 'Your answer helps us focus the first baseline.', options: ['Prototype', 'Working privately', 'Live with users', 'Not sure'] },
    { key: 'concern', title: 'What worries you most?', detail: 'This is a priority signal, not an audit finding.', options: ['Security', 'Quality and testing', 'Architecture', 'What to do next'] },
    { key: 'access', title: 'Can you share code for a future review?', detail: 'No connection or upload happens in this preview.', options: ['Read-only access later', "I can't share code", 'Not sure yet'] },
    { key: 'evidence', title: 'What verification already exists?', detail: 'We will not assume a passing test or a safe release.', options: ['Automated tests', 'Manual checks', 'Both', 'I do not know'] },
  ],
  business: [
    { key: 'workflow', title: 'What takes the most time every week?', detail: 'Pick a repeated process to map first.', options: ['New leads and follow-up', 'Quotes and documents', 'Scheduling and updates', 'Payments and reporting'] },
    { key: 'systems', title: 'Where does that work happen now?', detail: 'We will show a draft flow from the tools you name.', options: ['Email and spreadsheets', 'CRM and email', 'Several disconnected tools', 'Mostly manual'] },
    { key: 'volume', title: 'How often does it happen?', detail: 'We need real volume before estimating savings.', options: ['Every day', 'Several times a week', 'Occasionally', 'I do not know'] },
    { key: 'approval', title: 'What needs a human decision?', detail: 'Keep sensitive actions supervised.', options: ['Customer messages', 'Quotes or pricing', 'Payments', 'All of these'] },
  ],
  growth: [
    { key: 'audience', title: 'Who should find your product?', detail: 'Define the buyer before choosing channels.', options: ['Consumers', 'Business teams', 'Local customers', 'Not sure yet'] },
    { key: 'channels', title: 'Where can people find it today?', detail: 'Select what you currently know; this preview does not verify it.', options: ['Search', 'Social', 'Marketplace or directory', 'Nowhere reliably'] },
    { key: 'measurement', title: 'What are you measuring now?', detail: 'Metrics remain unverified without a connected source.', options: ['Visits', 'Leads or signups', 'Sales', 'Nothing yet'] },
    { key: 'bottleneck', title: 'What feels like the main obstacle?', detail: 'Treat this as your hypothesis until data supports it.', options: ['Not enough visibility', 'Weak conversion', 'Unclear positioning', 'Not sure'] },
  ],
};

const field = (value = 'Not known yet', state = 'UNKNOWN') => ({ value, state });
const confirmed = (value) => field(value, 'CONFIRMED');

export function suggestMode(goal) {
  const text = String(goal).toLowerCase();
  if (/lead|customer|traffic|discover|seo|market|grow|sales/.test(text)) return 'growth';
  if (/business|company|team|workflow|automate|manual|repetitive|operations/.test(text)) return 'business';
  if (/built|code|repo|prototype|existing|launch|fix|audit|bug/.test(text)) return 'existing';
  return 'idea';
}

export function interpretGoal(mode, goal) {
  const clean = String(goal).trim();
  const words = clean.split(/\s+/).slice(0, 24).join(' ');
  const type = mode === 'idea' ? (/app|mobile/i.test(clean) ? 'a new app' : /website|site/i.test(clean) ? 'a new website' : 'a new product')
    : mode === 'existing' ? 'an existing build that needs a baseline'
    : mode === 'business' ? 'a business workflow worth mapping'
    : 'a product that needs discovery';
  return { type, summary: words + (clean.split(/\s+/).length > 24 ? '…' : ''), source: 'Rule-based interpretation of your words; please confirm or clarify.' };
}

export function deriveGenome(state) {
  const { mode, answers, goalConfirmed } = state;
  const signals = {
    Goal: goalConfirmed ? confirmed(state.goal.trim()) : state.goal.trim() ? field(state.goal.trim(), 'INFERRED') : field(),
    Type: mode ? field(mode === 'idea' && state.goal ? interpretGoal(mode, state.goal).type : modes[mode]?.short || 'Project', goalConfirmed ? 'CONFIRMED' : 'INFERRED') : field(),
    Stage: field(),
    Audience: field(),
    Platforms: field(),
    Builder: field(),
    AI: field(),
    Payments: field(),
    Data: field(),
    Growth: field(),
    Risk: field(),
    Budget: field(),
  };
  if (mode === 'idea') {
    signals.Stage = confirmed('Idea');
    if (answers.audience) signals.Audience = confirmed(answers.audience);
    if (answers.platform) signals.Platforms = answers.platform === 'Recommend for me' ? field('Web first, to validate', 'RECOMMENDED') : confirmed(answers.platform);
    if (answers.accounts) signals.Data = confirmed(`Accounts: ${answers.accounts}`);
    if (answers.data) signals.Risk = answers.data === 'Yes' ? field('Privacy review needed', 'RECOMMENDED') : field('Assess before launch', 'UNVERIFIED');
    if (answers.ai) signals.AI = confirmed(answers.ai);
    if (answers.launch) signals.Growth = confirmed(answers.launch);
  } else if (mode === 'existing') {
    if (answers.stage) signals.Stage = confirmed(answers.stage);
    if (answers.concern) signals.Risk = field(`${answers.concern} priority`, 'INFERRED');
    if (answers.access) signals.Data = confirmed(answers.access);
    if (answers.evidence) signals.Builder = confirmed(`Checks: ${answers.evidence}`);
  } else if (mode === 'business') {
    if (answers.workflow) signals.Type = confirmed(answers.workflow);
    if (answers.systems) signals.Platforms = confirmed(answers.systems);
    if (answers.volume) signals.Stage = confirmed(answers.volume);
    if (answers.approval) signals.Risk = field('Human approval required', 'RECOMMENDED');
  } else if (mode === 'growth') {
    if (answers.audience) signals.Audience = confirmed(answers.audience);
    if (answers.channels) signals.Growth = confirmed(answers.channels);
    if (answers.measurement) signals.Data = confirmed(`Stated measure: ${answers.measurement}`);
    if (answers.bottleneck) signals.Risk = field(`Hypothesis: ${answers.bottleneck}`, 'UNVERIFIED');
    signals.Stage = confirmed('Built; seeking users');
  }
  return signals;
}

export function deriveCapabilities(state) {
  const { mode, answers } = state;
  const active = new Set(mode === 'idea' ? ['Research', 'Product', 'Design', 'Engineering', 'Business']
    : mode === 'existing' ? ['Engineering', 'Security', 'Recovery', 'Operations']
    : mode === 'business' ? ['Business', 'Automation', 'Operations']
    : mode === 'growth' ? ['Discovery', 'Growth', 'Business', 'Learning'] : []);
  if (mode === 'idea' && answers.accounts === 'Yes') active.add('Security');
  if (mode === 'idea' && answers.data === 'Yes') active.add('Security');
  if (mode === 'idea' && answers.ai === 'Yes, it is central') active.add('AI');
  if (mode === 'idea' && answers.launch === 'Sell a service') active.add('Sales');
  if (mode === 'idea' && answers.launch === 'Help first users') active.add('Discovery');
  if (mode === 'existing' && answers.concern === 'Quality and testing') active.add('Design');
  if (mode === 'existing' && answers.concern === 'Architecture') active.add('Product');
  if (mode === 'business' && answers.workflow === 'Payments and reporting') active.add('Pricing');
  if (mode === 'business' && answers.approval) active.add('Security');
  if (mode === 'growth' && answers.channels === 'Social') active.add('Media');
  if (mode === 'growth' && answers.bottleneck === 'Weak conversion') active.add('Design');
  return active;
}

export function getRecommendations(state) {
  const a = state.answers;
  const evidence = 'Based on your answers in this preview';
  const mk = (title, reason, confidence = 'MEDIUM CONFIDENCE') => ({ title, reason, confidence, evidence, accepted: state.acceptedRecommendations?.includes(title) || false });
  if (state.mode === 'idea') return [
    mk('Define the first useful outcome', `Start with ${a.launch && a.launch !== 'Recommend for me' ? a.launch.toLowerCase() : 'one outcome you can test'} before choosing technology.`),
    mk(a.platform === 'Mobile' ? 'Test a mobile-first scope' : 'Start with a focused first surface', a.platform === 'Recommend for me' || !a.platform ? 'Web is a preliminary starting point; confirm it with the audience before building.' : `You selected ${a.platform.toLowerCase()}; validate that choice with intended users.`),
    mk('Plan the data boundary early', a.data === 'Yes' ? 'You indicated sensitive information. Define what must be collected and reviewed before launch.' : 'Confirm account and data needs before deciding authentication or storage.', a.data ? 'MEDIUM CONFIDENCE' : 'NEEDS MORE INFORMATION'),
  ];
  if (state.mode === 'existing') return [
    mk('Capture a real baseline', 'Before changing code, record repository, branch, commit, stack, and current behavior.', 'HIGH CONFIDENCE'),
    mk('Verify the highest-risk path', a.concern ? `You identified ${a.concern.toLowerCase()} as a concern. Check it with evidence before calling the build ready.` : 'Choose one critical path and verify it with evidence.'),
    mk('Prioritize three next actions', 'Separate launch blockers from improvements after an actual review; this preview cannot issue findings.', 'NEEDS MORE INFORMATION'),
  ];
  if (state.mode === 'business') return [
    mk('Map the repeated process', a.workflow ? `Start with ${a.workflow.toLowerCase()} and record each handoff.` : 'Name one repeated workflow before selecting automation.'),
    mk('Measure volume and review cost', 'Real time saved and ROI require actual frequency, handling time, error rate, and implementation cost.', 'HIGH CONFIDENCE'),
    mk('Keep human approval in the loop', a.approval ? `You flagged ${a.approval.toLowerCase()} for review. Make that approval explicit in any future workflow.` : 'Identify which messages, quotes, or payments require approval.'),
  ];
  return [
    mk('Clarify who should find you', a.audience ? `You selected ${a.audience.toLowerCase()}. Test positioning against their real questions.` : 'Name the intended buyer before choosing channels.'),
    mk('Establish a discovery baseline', 'Inspect current search, channel, conversion, and analytics data before claiming a visibility gap.', 'HIGH CONFIDENCE'),
    mk('Choose one distribution experiment', a.channels && a.channels !== 'Nowhere reliably' ? `You cited ${a.channels.toLowerCase()}. Verify its current performance, then test one improvement.` : 'Select a channel your audience uses and define a measurable first experiment.'),
  ];
}

export function flowForBusiness(answers) {
  const workflow = answers.workflow || 'Choose a repeated process';
  if (workflow === 'New leads and follow-up') return ['Lead', 'Capture', 'CRM / record', 'Follow-up draft', 'Human review', 'Customer update'];
  if (workflow === 'Quotes and documents') return ['Request', 'Collect details', 'Draft quote', 'Human review', 'Send', 'Record outcome'];
  if (workflow === 'Scheduling and updates') return ['Request', 'Schedule', 'Confirm', 'Send update', 'Record change'];
  if (workflow === 'Payments and reporting') return ['Work completed', 'Invoice review', 'Payment', 'Reconcile', 'Report'];
  return [workflow, 'Observe steps', 'Measure handoffs', 'Choose next action'];
}
