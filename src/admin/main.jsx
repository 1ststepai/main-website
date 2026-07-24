import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleDollarSign,
  Copy,
  Eye,
  FileText,
  GripVertical,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Plus,
  Printer,
  Save,
  Send,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import "./admin.css";

const DEFAULT_TEMPLATES = [
  {
    id: "website-build",
    name: "Website build agreement",
    sections: [
      { id: "scope", title: "Scope", body: "The studio will provide the deliverables listed in the accepted quote. Work outside that scope requires written approval and may be quoted separately.", enabled: true },
      { id: "timeline", title: "Timeline", body: "Target dates begin after the deposit, required content, and account access are received. Client delays may move the delivery schedule.", enabled: true },
      { id: "payment", title: "Payment schedule", body: "A 50% deposit reserves the project. The remaining balance is due before launch or final file transfer unless the quote states otherwise.", enabled: true },
      { id: "revisions", title: "Revisions", body: "Two reasonable revision rounds are included for each approved design stage. New direction or added scope may require a change order.", enabled: true },
      { id: "ownership", title: "Ownership", body: "After payment in full, the client receives rights to the final custom deliverables. The studio retains its pre-existing tools, reusable components, and know-how.", enabled: true },
      { id: "third-party", title: "Third-party services", body: "The client is responsible for approved domain, hosting, plugin, font, stock media, and other third-party fees unless they are included in the quote.", enabled: true },
      { id: "cancellation", title: "Cancellation", body: "Either party may end the project in writing. Completed work and committed third-party costs remain payable; the deposit is applied to work already reserved or performed.", enabled: true },
      { id: "outcomes", title: "Outcomes and acceptance", body: "The studio will perform the services with reasonable care but does not guarantee revenue, rankings, traffic, funding, platform approval, or other business results.", enabled: true },
    ],
  },
  {
    id: "ios-app-build",
    name: "iOS app build agreement",
    sections: [
      { id: "scope", title: "Scope", body: "The studio will build the features and delivery stages listed in the accepted quote. Additional platforms, integrations, or features require a written change order.", enabled: true },
      { id: "timeline", title: "Timeline", body: "Milestones begin after the deposit, product decisions, content, test accounts, and required access are received. Review and App Store timelines are estimates.", enabled: true },
      { id: "payment", title: "Payment schedule", body: "A 50% deposit reserves the build. Remaining milestone payments are due as listed in the quote and before production release or source transfer.", enabled: true },
      { id: "revisions", title: "Revisions and testing", body: "Two revision rounds are included for approved interface stages. The client will test milestone builds and report reproducible issues within the agreed review window.", enabled: true },
      { id: "ownership", title: "Code and ownership", body: "After payment in full, the client receives the final custom project code and deliverables. The studio retains pre-existing libraries, reusable components, and general know-how.", enabled: true },
      { id: "accounts", title: "Developer accounts and services", body: "The client owns and pays for Apple Developer membership, hosting, APIs, subscriptions, and third-party services unless the quote specifically includes them.", enabled: true },
      { id: "store-review", title: "Platform review", body: "The studio will prepare the agreed submission materials but cannot guarantee App Store acceptance, review timing, search position, downloads, or revenue.", enabled: true },
      { id: "cancellation", title: "Cancellation", body: "Either party may end the project in writing. Completed milestones, reserved work, and committed third-party costs remain payable.", enabled: true },
    ],
  },
];

const EMPTY_WORKSPACE = {
  revision: 0,
  updated_at: null,
  clients: [],
  quotes: [],
  templates: DEFAULT_TEMPLATES,
};

const NAVIGATION = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "clients", label: "Clients", icon: Users },
  { id: "quotes", label: "Quotes", icon: FileText },
  { id: "contracts", label: "Contracts", icon: ScrollText },
  { id: "settings", label: "Settings", icon: Settings },
];

function recordId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function quoteTotal(quote) {
  return quote.line_items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.rate) || 0), 0);
}

function createClient(overrides = {}) {
  return {
    id: recordId("client"),
    company: "",
    contact_name: "",
    email: "",
    phone: "",
    website: "",
    billing_address: "",
    ...overrides,
  };
}

function createQuote(client, template, sequence = 1, overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: recordId("quote"),
    quote_number: `FS-${String(sequence).padStart(4, "0")}`,
    status: "draft",
    created_at: now,
    updated_at: now,
    valid_until: isoDate(30),
    client_id: client.id,
    project_title: "",
    summary: "",
    currency: "USD",
    line_items: [
      { id: recordId("item"), name: "Discovery & planning", description: "Requirements, roadmap, and project plan", quantity: 1, rate: 0 },
      { id: recordId("item"), name: "Design & build", description: "Custom product design and implementation", quantity: 1, rate: 0 },
      { id: recordId("item"), name: "Launch", description: "Testing, handoff, and production launch", quantity: 1, rate: 0 },
    ],
    deposit_percent: 50,
    notes: "Quote valid for 30 days. Third-party services are billed separately unless listed above.",
    contract_template_id: template.id,
    contract_sections: structuredClone(template.sections),
    ...overrides,
  };
}

function previewWorkspace() {
  const client = createClient({
    company: "Northstar Home Services",
    contact_name: "Jordan Lee",
    email: "jordan@northstar.example",
    phone: "(555) 014-0198",
    website: "https://northstar.example",
    billing_address: "24 Market Street\nMorristown, NJ 07960",
  });
  const quote = createQuote(client, DEFAULT_TEMPLATES[0], 24, {
    project_title: "Premium website transformation",
    summary: "A high-end, conversion-focused website with custom motion, a streamlined service journey, and a simple content editing system.",
    line_items: [
      { id: recordId("item"), name: "Strategy & architecture", description: "Workshops, sitemap, content direction", quantity: 1, rate: 1500 },
      { id: recordId("item"), name: "UI/UX design", description: "Responsive visual system and key page designs", quantity: 1, rate: 3500 },
      { id: recordId("item"), name: "Website development", description: "Custom frontend, motion, and CMS integration", quantity: 1, rate: 6500 },
      { id: recordId("item"), name: "QA & launch", description: "Cross-device testing and production launch", quantity: 1, rate: 1250 },
    ],
  });
  return { ...EMPTY_WORKSPACE, clients: [client], quotes: [quote] };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "The request could not be completed.");
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

function Logo() {
  return (
    <div className="studio-logo">
      <span className="studio-logo-mark" aria-hidden="true" />
      <span><strong>1stStep</strong><b>.ai</b><small>Studio</small></span>
    </div>
  );
}

function Login({ onAuthenticated }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("/api/admin-session", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      onAuthenticated();
    } catch (error) {
      setMessage(error.code === "invalid_credentials"
        ? "That password was not accepted."
        : error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <Logo />
        <div className="login-copy">
          <h1 id="login-title">Your client work, in one private studio.</h1>
          <p>Create polished quotes, shape agreement terms, and keep every project decision organized.</p>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="studio-password">Owner password</label>
          <input
            id="studio-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            autoFocus
          />
          {message && <p className="form-error" role="alert">{message}</p>}
          <button className="button primary full" type="submit" disabled={busy}>
            <ShieldCheck size={18} />
            {busy ? "Checking…" : "Enter 1stStep Studio"}
          </button>
        </form>
        <p className="login-security"><ShieldCheck size={14} /> Owner-only access. Your client records stay behind a signed session.</p>
      </section>
    </main>
  );
}

function Sidebar({ page, setPage, onLogout, mobileOpen, setMobileOpen }) {
  return (
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <div className="sidebar-head">
        <Logo />
        <button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X /></button>
      </div>
      <nav aria-label="Studio navigation">
        {NAVIGATION.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            onClick={() => { setPage(id); setMobileOpen(false); }}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="owner-avatar">EP</div>
        <div><strong>Owner</strong><span>1stStep.ai</span></div>
        <button className="icon-button" onClick={onLogout} aria-label="Log out"><LogOut size={17} /></button>
      </div>
    </aside>
  );
}

function Topbar({ title, status, onMenu, actions }) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <button className="icon-button menu-button" onClick={onMenu} aria-label="Open navigation"><Menu /></button>
        <div><h1>{title}</h1>{status && <span className={`status ${status}`}>{status}</span>}</div>
      </div>
      <div className="topbar-actions">{actions}</div>
    </header>
  );
}

function EmptyState({ icon: Icon, title, body, action, actionLabel }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon /></div>
      <h2>{title}</h2>
      <p>{body}</p>
      {action && <button className="button primary" onClick={action}><Plus size={17} />{actionLabel}</button>}
    </div>
  );
}

function Overview({ workspace, onEditQuote, onNewQuote }) {
  const activeQuotes = workspace.quotes.filter((quote) => !["archived", "declined"].includes(quote.status));
  const totals = activeQuotes.reduce((sum, quote) => sum + quoteTotal(quote), 0);
  const recent = [...workspace.quotes].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 5);
  return (
    <div className="page-content">
      <section className="overview-intro">
        <div><h2>Keep the commercial side as polished as the work.</h2><p>Build a quote, attach the right agreement structure, and move the project forward without rebuilding documents from scratch.</p></div>
        <button className="button primary" onClick={onNewQuote}><Plus size={17} />New quote</button>
      </section>
      <section className="stat-rail" aria-label="Workspace summary">
        <div><span>Active quotes</span><strong>{activeQuotes.length}</strong></div>
        <div><span>Quoted value</span><strong>{currency(totals)}</strong></div>
        <div><span>Clients</span><strong>{workspace.clients.length}</strong></div>
        <div><span>Agreement templates</span><strong>{workspace.templates.length}</strong></div>
      </section>
      <section className="data-section">
        <div className="section-heading"><div><h2>Recent quotes</h2><p>The latest client documents in your workspace.</p></div></div>
        {recent.length ? (
          <div className="quote-table">
            {recent.map((quote) => {
              const client = workspace.clients.find((item) => item.id === quote.client_id);
              return (
                <button key={quote.id} onClick={() => onEditQuote(quote.id)}>
                  <div><strong>{quote.project_title || "Untitled project"}</strong><span>{client?.company || "Client details needed"}</span></div>
                  <span className={`status ${quote.status}`}>{quote.status}</span>
                  <strong>{currency(quoteTotal(quote))}</strong>
                  <span>{formatDate(quote.valid_until)}</span>
                </button>
              );
            })}
          </div>
        ) : <EmptyState icon={FileText} title="Your first quote starts here" body="Create a client-ready scope, price, deposit, and agreement structure in one flow." action={onNewQuote} actionLabel="Create a quote" />}
      </section>
    </div>
  );
}

function ClientsPage({ workspace, updateWorkspace }) {
  const [selectedId, setSelectedId] = useState(workspace.clients[0]?.id || null);
  const selected = workspace.clients.find((client) => client.id === selectedId);

  function addClient() {
    const client = createClient();
    updateWorkspace((current) => ({ ...current, clients: [...current.clients, client] }));
    setSelectedId(client.id);
  }

  function updateClient(field, value) {
    updateWorkspace((current) => ({
      ...current,
      clients: current.clients.map((client) => client.id === selectedId ? { ...client, [field]: value } : client),
    }));
  }

  return (
    <div className="page-content split-page">
      <section className="list-panel">
        <div className="section-heading"><div><h2>Clients</h2><p>Contact and billing details used in quotes.</p></div><button className="button compact" onClick={addClient}><Plus size={16} />Add client</button></div>
        <div className="search-field"><Search size={16} /><input aria-label="Search clients" placeholder="Search clients" /></div>
        <div className="record-list">
          {workspace.clients.map((client) => (
            <button key={client.id} className={client.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(client.id)}>
              <span className="client-monogram">{(client.company || client.contact_name || "?").slice(0, 1).toUpperCase()}</span>
              <span><strong>{client.company || "New client"}</strong><small>{client.contact_name || "Contact details needed"}</small></span>
            </button>
          ))}
        </div>
      </section>
      <section className="editor-panel">
        {selected ? (
          <>
            <div className="section-heading"><div><h2>{selected.company || "New client"}</h2><p>These details appear on new quotes.</p></div></div>
            <div className="form-grid two">
              <Field label="Company" value={selected.company} onChange={(value) => updateClient("company", value)} />
              <Field label="Contact name" value={selected.contact_name} onChange={(value) => updateClient("contact_name", value)} />
              <Field label="Email" type="email" value={selected.email} onChange={(value) => updateClient("email", value)} />
              <Field label="Phone" value={selected.phone} onChange={(value) => updateClient("phone", value)} />
              <Field label="Website" type="url" value={selected.website} onChange={(value) => updateClient("website", value)} />
              <Field label="Billing address" multiline value={selected.billing_address} onChange={(value) => updateClient("billing_address", value)} />
            </div>
          </>
        ) : <EmptyState icon={Users} title="No clients yet" body="Add a client once, then reuse their details across quotes." action={addClient} actionLabel="Add a client" />}
      </section>
    </div>
  );
}

function QuotesPage({ workspace, onEditQuote, onNewQuote }) {
  return (
    <div className="page-content">
      <div className="section-heading page-heading">
        <div><h2>Quotes</h2><p>Scope, pricing, deposit, and agreement terms—kept together.</p></div>
        <button className="button primary" onClick={onNewQuote}><Plus size={17} />New quote</button>
      </div>
      {workspace.quotes.length ? (
        <div className="quote-table headed">
          <div className="table-head"><span>Project</span><span>Status</span><span>Value</span><span>Valid until</span></div>
          {[...workspace.quotes].reverse().map((quote) => {
            const client = workspace.clients.find((item) => item.id === quote.client_id);
            return (
              <button key={quote.id} onClick={() => onEditQuote(quote.id)}>
                <div><strong>{quote.project_title || "Untitled project"}</strong><span>{client?.company || "Client details needed"} · {quote.quote_number}</span></div>
                <span className={`status ${quote.status}`}>{quote.status}</span>
                <strong>{currency(quoteTotal(quote))}</strong>
                <span>{formatDate(quote.valid_until)}</span>
              </button>
            );
          })}
        </div>
      ) : <EmptyState icon={FileText} title="Create your first quote" body="Start with a reusable agreement structure, then add the exact scope and price for this client." action={onNewQuote} actionLabel="Create a quote" />}
    </div>
  );
}

function ContractsPage({ workspace, updateWorkspace }) {
  const [selectedId, setSelectedId] = useState(workspace.templates[0]?.id || null);
  const selected = workspace.templates.find((template) => template.id === selectedId);

  function updateTemplate(updater) {
    updateWorkspace((current) => ({
      ...current,
      templates: current.templates.map((template) => template.id === selectedId ? updater(template) : template),
    }));
  }

  function addTemplate() {
    const template = {
      id: recordId("template"),
      name: "New agreement structure",
      sections: [{ id: recordId("section"), title: "Scope", body: "", enabled: true }],
    };
    updateWorkspace((current) => ({ ...current, templates: [...current.templates, template] }));
    setSelectedId(template.id);
  }

  return (
    <div className="page-content split-page contracts-page">
      <section className="list-panel">
        <div className="section-heading"><div><h2>Agreement structures</h2><p>Reusable starting terms for each kind of project.</p></div></div>
        <div className="record-list template-list">
          {workspace.templates.map((template) => (
            <button key={template.id} className={template.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(template.id)}>
              <span className="client-monogram"><ScrollText size={16} /></span>
              <span><strong>{template.name}</strong><small>{template.sections.length} sections</small></span>
            </button>
          ))}
        </div>
        <button className="button compact full" onClick={addTemplate}><Plus size={16} />New structure</button>
      </section>
      <section className="editor-panel">
        {selected && (
          <>
            <div className="section-heading">
              <div><h2>{selected.name}</h2><p>Starter language only—have your attorney review it before client use.</p></div>
            </div>
            <Field label="Structure name" value={selected.name} onChange={(value) => updateTemplate((template) => ({ ...template, name: value }))} />
            <div className="template-sections">
              {selected.sections.map((section, index) => (
                <article key={section.id} className="template-section">
                  <div className="template-section-head">
                    <GripVertical size={17} />
                    <input aria-label={`Section ${index + 1} title`} value={section.title} onChange={(event) => updateTemplate((template) => ({
                      ...template,
                      sections: template.sections.map((item) => item.id === section.id ? { ...item, title: event.target.value } : item),
                    }))} />
                    <button className="icon-button danger" aria-label={`Delete ${section.title}`} onClick={() => updateTemplate((template) => ({
                      ...template,
                      sections: template.sections.filter((item) => item.id !== section.id),
                    }))}><Trash2 size={16} /></button>
                  </div>
                  <textarea aria-label={`${section.title} language`} value={section.body} rows={4} onChange={(event) => updateTemplate((template) => ({
                    ...template,
                    sections: template.sections.map((item) => item.id === section.id ? { ...item, body: event.target.value } : item),
                  }))} />
                </article>
              ))}
              <button className="button compact" onClick={() => updateTemplate((template) => ({
                ...template,
                sections: [...template.sections, { id: recordId("section"), title: "New section", body: "", enabled: true }],
              }))}><Plus size={16} />Add section</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function SettingsPage({ workspace, previewMode }) {
  return (
    <div className="page-content settings-page">
      <div className="section-heading page-heading"><div><h2>Studio settings</h2><p>Security and storage status for this owner workspace.</p></div></div>
      <section className="settings-band">
        <ShieldCheck />
        <div><strong>Owner-only access</strong><p>Production access uses a signed, HTTP-only, same-site session. The admin route is not linked from the public website and is marked noindex.</p></div>
        <span className="health">{previewMode ? "Local preview" : "Protected"}</span>
      </section>
      <section className="settings-band">
        <Save />
        <div><strong>Workspace storage</strong><p>Clients, quotes, and agreement structures save to the existing private Vercel KV connection with revision checks to prevent silent overwrites.</p></div>
        <span>{workspace.updated_at ? `Saved ${new Date(workspace.updated_at).toLocaleString()}` : "Not saved yet"}</span>
      </section>
      <section className="settings-band caution">
        <ScrollText />
        <div><strong>Contract language review</strong><p>The included structures are practical drafting starters, not legal advice. Have qualified counsel review your final terms for your business and jurisdiction.</p></div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", multiline = false, min, max, step, help }) {
  const Control = multiline ? "textarea" : "input";
  return (
    <label className="field">
      <span>{label}</span>
      <Control
        type={multiline ? undefined : type}
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        rows={multiline ? 3 : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {help && <small>{help}</small>}
    </label>
  );
}

function RecentQuoteRail({ workspace, selectedId, onSelect }) {
  return (
    <aside className="recent-rail">
      <div className="rail-title"><h2>Recent quotes</h2><span>{workspace.quotes.length}</span></div>
      <div className="rail-records">
        {[...workspace.quotes].reverse().map((quote) => {
          const client = workspace.clients.find((item) => item.id === quote.client_id);
          return (
            <button key={quote.id} className={quote.id === selectedId ? "selected" : ""} onClick={() => onSelect(quote.id)}>
              <strong>{quote.project_title || "Untitled project"}</strong>
              <span>{client?.company || "Client details needed"}</span>
              <small><i className={quote.status} />{quote.status}<b>{quote.quote_number}</b></small>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function LineItems({ quote, updateQuote }) {
  function updateItem(id, field, value) {
    updateQuote({
      line_items: quote.line_items.map((item) => item.id === id ? {
        ...item,
        [field]: ["quantity", "rate"].includes(field) ? Number(value) : value,
      } : item),
    });
  }
  return (
    <section className="document-section">
      <div className="document-section-heading"><h2>Scope & pricing</h2><button className="button compact" onClick={() => updateQuote({
        line_items: [...quote.line_items, { id: recordId("item"), name: "", description: "", quantity: 1, rate: 0 }],
      })}><Plus size={15} />Add line item</button></div>
      <div className="line-items">
        <div className="line-head"><span /><span>Item</span><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span><span /></div>
        {quote.line_items.map((item, index) => (
          <div className="line-row" key={item.id}>
            <GripVertical size={15} />
            <input aria-label={`Line item ${index + 1} name`} value={item.name} onChange={(event) => updateItem(item.id, "name", event.target.value)} />
            <input aria-label={`Line item ${index + 1} description`} value={item.description} onChange={(event) => updateItem(item.id, "description", event.target.value)} />
            <input aria-label={`Line item ${index + 1} quantity`} type="number" min="0" step="0.25" value={item.quantity} onChange={(event) => updateItem(item.id, "quantity", event.target.value)} />
            <input aria-label={`Line item ${index + 1} rate`} type="number" min="0" step="50" value={item.rate} onChange={(event) => updateItem(item.id, "rate", event.target.value)} />
            <strong>{currency(item.quantity * item.rate)}</strong>
            <button className="icon-button danger" aria-label={`Delete ${item.name || "line item"}`} onClick={() => updateQuote({
              line_items: quote.line_items.filter((candidate) => candidate.id !== item.id),
            })}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ContractInspector({ quote, templates, updateQuote }) {
  const [openSection, setOpenSection] = useState(quote.contract_sections[0]?.id || null);

  function selectTemplate(templateId) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    updateQuote({
      contract_template_id: template.id,
      contract_sections: structuredClone(template.sections),
    });
    setOpenSection(template.sections[0]?.id || null);
  }

  function updateSection(sectionId, patch) {
    updateQuote({
      contract_sections: quote.contract_sections.map((section) => section.id === sectionId ? { ...section, ...patch } : section),
    });
  }

  return (
    <aside className="contract-inspector">
      <div className="inspector-title"><div><h2>Contract structure</h2><p>Included with this quote</p></div><ScrollText size={19} /></div>
      <label className="select-field">
        <span>Starting structure</span>
        <select value={quote.contract_template_id} onChange={(event) => selectTemplate(event.target.value)}>
          {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
        <ChevronDown size={15} />
      </label>
      <div className="legal-note"><ShieldCheck size={15} /><span>Drafting starter—not legal advice. Review final terms with counsel.</span></div>
      <div className="contract-sections">
        {quote.contract_sections.map((section) => {
          const open = openSection === section.id;
          return (
            <article key={section.id} className={open ? "open" : ""}>
              <button className="contract-section-toggle" onClick={() => setOpenSection(open ? null : section.id)}>
                <span className="section-symbol">{section.title.slice(0, 1)}</span>
                <span><strong>{section.title}</strong><small>{section.enabled ? "Included" : "Excluded"}</small></span>
                <ChevronDown size={16} />
              </button>
              {open && (
                <div className="contract-section-body">
                  <label className="toggle"><input type="checkbox" checked={section.enabled} onChange={(event) => updateSection(section.id, { enabled: event.target.checked })} /><span />Include in quote</label>
                  <input aria-label={`${section.title} title`} value={section.title} onChange={(event) => updateSection(section.id, { title: event.target.value })} />
                  <textarea aria-label={`${section.title} terms`} value={section.body} rows={6} onChange={(event) => updateSection(section.id, { body: event.target.value })} />
                </div>
              )}
            </article>
          );
        })}
      </div>
      <button className="button compact full" onClick={() => {
        const section = { id: recordId("section"), title: "New section", body: "", enabled: true };
        updateQuote({ contract_sections: [...quote.contract_sections, section] });
        setOpenSection(section.id);
      }}><Plus size={15} />Add section</button>
    </aside>
  );
}

function QuoteEditor({ workspace, quoteId, onSelectQuote, updateWorkspace }) {
  const quote = workspace.quotes.find((item) => item.id === quoteId);
  const client = workspace.clients.find((item) => item.id === quote?.client_id);
  if (!quote || !client) return null;

  function updateQuote(patch) {
    updateWorkspace((current) => ({
      ...current,
      quotes: current.quotes.map((item) => item.id === quote.id ? { ...item, ...patch, updated_at: new Date().toISOString() } : item),
    }));
  }
  function updateClient(patch) {
    updateWorkspace((current) => ({
      ...current,
      clients: current.clients.map((item) => item.id === client.id ? { ...item, ...patch } : item),
    }));
  }

  const total = quoteTotal(quote);
  const deposit = total * quote.deposit_percent / 100;

  return (
    <div className="quote-workspace">
      <RecentQuoteRail workspace={workspace} selectedId={quote.id} onSelect={onSelectQuote} />
      <main className="quote-document">
        <section className="document-section">
          <div className="document-section-heading"><h2>Client</h2><span>{quote.quote_number}</span></div>
          <div className="client-grid">
            <Field label="Company" value={client.company} onChange={(value) => updateClient({ company: value })} />
            <Field label="Contact person" value={client.contact_name} onChange={(value) => updateClient({ contact_name: value })} />
            <Field label="Email" type="email" value={client.email} onChange={(value) => updateClient({ email: value })} />
            <Field label="Phone" value={client.phone} onChange={(value) => updateClient({ phone: value })} />
          </div>
        </section>
        <section className="document-section">
          <div className="document-section-heading"><h2>Project</h2><label className="date-inline"><span>Valid until</span><input type="date" value={quote.valid_until} onChange={(event) => updateQuote({ valid_until: event.target.value })} /></label></div>
          <Field label="Project title" value={quote.project_title} onChange={(value) => updateQuote({ project_title: value })} />
          <Field label="Project summary" multiline value={quote.summary} onChange={(value) => updateQuote({ summary: value })} />
        </section>
        <LineItems quote={quote} updateQuote={updateQuote} />
        <section className="document-section totals-section">
          <Field label="Notes" multiline value={quote.notes} onChange={(value) => updateQuote({ notes: value })} />
          <div className="totals">
            <div><span>Subtotal</span><strong>{currency(total)}</strong></div>
            <label><span>Deposit</span><span className="percentage"><input aria-label="Deposit percent" type="number" min="0" max="100" value={quote.deposit_percent} onChange={(event) => updateQuote({ deposit_percent: Number(event.target.value) })} />%</span><strong>{currency(deposit)}</strong></label>
            <small>Due on approval</small>
            <div className="balance"><span>Balance</span><strong>{currency(total - deposit)}</strong></div>
          </div>
        </section>
      </main>
      <ContractInspector quote={quote} templates={workspace.templates} updateQuote={updateQuote} />
    </div>
  );
}

function QuotePreview({ quote, client, onClose, onSend, previewMode }) {
  const total = quoteTotal(quote);
  const deposit = total * quote.deposit_percent / 100;
  const [emailPanelOpen, setEmailPanelOpen] = useState(false);
  const [emailNote, setEmailNote] = useState(`Here is the quote we discussed for ${quote.project_title || "your project"}. Please reply directly with any questions or requested changes.`);
  const [emailState, setEmailState] = useState({ busy: false, message: "", error: false });
  const idempotencyKey = useRef(`quote-send/${quote.id}/${crypto.randomUUID()}`);

  async function submitEmail(event) {
    event.preventDefault();
    setEmailState({ busy: true, message: "", error: false });
    try {
      const result = await onSend(quote.id, emailNote, idempotencyKey.current);
      setEmailState({ busy: false, message: result.message, error: false });
    } catch (error) {
      setEmailState({ busy: false, message: error.message, error: true });
    }
  }

  return (
    <div className={`preview-overlay ${emailPanelOpen ? "sending" : ""}`} role="dialog" aria-modal="true" aria-labelledby="preview-title">
      <div className="preview-toolbar">
        <div><strong id="preview-title">Quote preview</strong><span>Review the final document before printing or saving as PDF.</span></div>
        <div>
          <button className="button" onClick={onClose}><X size={16} />Close</button>
          <button className="button" onClick={() => window.print()}><Printer size={17} />Print / Save PDF</button>
          <button className="button primary" onClick={() => setEmailPanelOpen(true)} disabled={!client.email}><Mail size={17} />Email quote</button>
        </div>
      </div>
      {emailPanelOpen && (
        <div className="send-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEmailPanelOpen(false)}>
          <form className="send-dialog" onSubmit={submitEmail}>
            <div className="send-dialog-heading">
              <div className="send-dialog-icon"><Send size={19} /></div>
              <div><h2>Send this quote</h2><p>Resend will deliver the saved quote and agreement terms directly from your backend.</p></div>
              <button type="button" className="icon-button" onClick={() => setEmailPanelOpen(false)} aria-label="Close email panel"><X size={17} /></button>
            </div>
            <dl>
              <div><dt>From</dt><dd>Evan at 1stStep.ai &lt;evan@1ststep.ai&gt;</dd></div>
              <div><dt>To</dt><dd>{client.contact_name || client.company} &lt;{client.email || "Add a client email first"}&gt;</dd></div>
              <div><dt>Subject</dt><dd>Quote {quote.quote_number}: {quote.project_title || "Project quote"} from 1stStep.ai</dd></div>
            </dl>
            <label>
              <span>Personal note</span>
              <textarea rows={6} maxLength={1600} value={emailNote} onChange={(event) => setEmailNote(event.target.value)} />
            </label>
            {emailState.message && <p className={emailState.error ? "send-feedback error" : "send-feedback success"} role="status">
              {emailState.error ? <X size={15} /> : <Check size={15} />}{emailState.message}
            </p>}
            {previewMode && <p className="send-preview-note"><Eye size={14} />Local preview mode will simulate delivery and will not send an email.</p>}
            <div className="send-dialog-actions">
              <button type="button" className="button" onClick={() => setEmailPanelOpen(false)}>Cancel</button>
              <button type="submit" className="button primary" disabled={emailState.busy || !client.email}>
                <Send size={16} />{emailState.busy ? "Sending…" : `Send to ${client.email || "client"}`}
              </button>
            </div>
          </form>
        </div>
      )}
      <article className="quote-preview">
        <header className="print-header">
          <Logo />
          <div><strong>QUOTE</strong><span>{quote.quote_number}</span></div>
        </header>
        <section className="print-meta">
          <div><small>Prepared for</small><strong>{client.company || client.contact_name || "Client"}</strong><span>{client.contact_name}</span><span>{client.email}</span><span>{client.billing_address}</span></div>
          <div><small>Project</small><strong>{quote.project_title || "Project quote"}</strong><span>Issued {formatDate(quote.created_at?.slice(0, 10))}</span><span>Valid until {formatDate(quote.valid_until)}</span></div>
        </section>
        {quote.summary && <p className="print-summary">{quote.summary}</p>}
        <table>
          <thead><tr><th>Scope</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
          <tbody>{quote.line_items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><span>{item.description}</span></td><td>{item.quantity}</td><td>{currency(item.rate)}</td><td>{currency(item.quantity * item.rate)}</td></tr>)}</tbody>
        </table>
        <section className="print-totals">
          <div><span>Subtotal</span><strong>{currency(total)}</strong></div>
          <div><span>{quote.deposit_percent}% deposit · due on approval</span><strong>{currency(deposit)}</strong></div>
          <div><span>Remaining balance</span><strong>{currency(total - deposit)}</strong></div>
        </section>
        {quote.notes && <section className="print-notes"><h2>Notes</h2><p>{quote.notes}</p></section>}
        <section className="print-contract">
          <h1>Agreement structure</h1>
          {quote.contract_sections.filter((section) => section.enabled).map((section, index) => (
            <div key={section.id}><h2>{index + 1}. {section.title}</h2><p>{section.body}</p></div>
          ))}
        </section>
        <section className="signature-grid">
          <div><span>Client signature</span><i /><small>Name and date</small></div>
          <div><span>1stStep.ai</span><i /><small>Authorized signature and date</small></div>
        </section>
      </article>
    </div>
  );
}

function StudioApp({ previewMode = false }) {
  const [workspace, setWorkspace] = useState(previewMode ? previewWorkspace() : EMPTY_WORKSPACE);
  const [page, setPage] = useState(previewMode ? "quote-editor" : "overview");
  const [selectedQuoteId, setSelectedQuoteId] = useState(previewMode ? workspace.quotes[0]?.id : null);
  const [previewQuoteId, setPreviewQuoteId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (previewMode) return;
    api("/api/admin-workspace")
      .then((data) => setWorkspace(data.workspace))
      .catch((error) => setMessage(error.message));
  }, [previewMode]);

  function updateWorkspace(updater) {
    setWorkspace((current) => updater(current));
    setDirty(true);
    setMessage("");
  }

  function newQuote() {
    const template = workspace.templates[0] || DEFAULT_TEMPLATES[0];
    const client = createClient();
    const quote = createQuote(client, template, workspace.quotes.length + 1);
    updateWorkspace((current) => ({
      ...current,
      clients: [...current.clients, client],
      quotes: [...current.quotes, quote],
    }));
    setSelectedQuoteId(quote.id);
    setPage("quote-editor");
  }

  function editQuote(id) {
    setSelectedQuoteId(id);
    setPage("quote-editor");
  }

  async function save() {
    setSaving(true);
    setMessage("");
    if (previewMode) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setDirty(false);
      setMessage("Preview changes saved for this session.");
      setSaving(false);
      return;
    }
    try {
      const data = await api("/api/admin-workspace", {
        method: "PUT",
        body: JSON.stringify({ expected_revision: workspace.revision, workspace }),
      });
      setWorkspace(data.workspace);
      setDirty(false);
      setMessage("Workspace saved.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendQuote(quoteId, note, idempotencyKey) {
    if (previewMode) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      return { message: "Preview delivery simulated. No email was sent." };
    }
    const data = await api("/api/admin-send-quote", {
      method: "POST",
      body: JSON.stringify({
        quote_id: quoteId,
        note,
        idempotency_key: idempotencyKey,
      }),
    });
    if (data.workspace) {
      setWorkspace(data.workspace);
      setDirty(false);
    }
    return {
      message: data.status_saved
        ? "Quote sent from evan@1ststep.ai and marked as sent."
        : data.message || "Quote sent from evan@1ststep.ai.",
    };
  }

  async function logout() {
    if (!previewMode) await api("/api/admin-session", { method: "DELETE", body: "{}" }).catch(() => {});
    window.location.reload();
  }

  const selectedQuote = workspace.quotes.find((quote) => quote.id === selectedQuoteId);
  const previewQuote = workspace.quotes.find((quote) => quote.id === previewQuoteId);
  const previewClient = workspace.clients.find((client) => client.id === previewQuote?.client_id);
  const pageTitle = page === "quote-editor" ? (selectedQuote?.project_title || "New quote") : NAVIGATION.find((item) => item.id === page)?.label || "1stStep Studio";

  let pageContent;
  if (page === "overview") pageContent = <Overview workspace={workspace} onEditQuote={editQuote} onNewQuote={newQuote} />;
  if (page === "clients") pageContent = <ClientsPage workspace={workspace} updateWorkspace={updateWorkspace} />;
  if (page === "quotes") pageContent = <QuotesPage workspace={workspace} onEditQuote={editQuote} onNewQuote={newQuote} />;
  if (page === "contracts") pageContent = <ContractsPage workspace={workspace} updateWorkspace={updateWorkspace} />;
  if (page === "settings") pageContent = <SettingsPage workspace={workspace} previewMode={previewMode} />;
  if (page === "quote-editor") pageContent = selectedQuote
    ? <QuoteEditor workspace={workspace} quoteId={selectedQuote.id} onSelectQuote={setSelectedQuoteId} updateWorkspace={updateWorkspace} />
    : <EmptyState icon={FileText} title="Quote not found" body="Return to Quotes and choose another document." />;

  const editorActions = page === "quote-editor" && selectedQuote;
  return (
    <div className="studio-shell">
      <Sidebar page={page === "quote-editor" ? "quotes" : page} setPage={setPage} onLogout={logout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="studio-main">
        <Topbar
          title={pageTitle}
          status={editorActions ? selectedQuote.status : null}
          onMenu={() => setMobileOpen(true)}
          actions={(
            <>
              {message && <span className="save-message" role="status">{message}</span>}
              {page === "quote-editor" && <button className="button ghost" onClick={() => setPage("quotes")}><ArrowLeft size={16} />All quotes</button>}
              <button className="button" onClick={save} disabled={saving || (!dirty && !previewMode)}><Save size={16} />{saving ? "Saving…" : dirty ? "Save draft" : "Saved"}</button>
              {editorActions && <button className="button primary" onClick={() => setPreviewQuoteId(selectedQuote.id)}><Eye size={17} />Preview & send</button>}
            </>
          )}
        />
        {previewMode && <div className="preview-banner"><Eye size={15} />Local design preview. Sample records stay in this browser session and are never uploaded.</div>}
        <div className="workspace-body">{pageContent}</div>
      </div>
      {previewQuote && previewClient && (
        <QuotePreview
          quote={previewQuote}
          client={previewClient}
          onClose={() => setPreviewQuoteId(null)}
          onSend={sendQuote}
          previewMode={previewMode}
        />
      )}
    </div>
  );
}

function Root() {
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "1";
  const [loading, setLoading] = useState(!previewMode);
  const [authenticated, setAuthenticated] = useState(previewMode);

  async function checkSession() {
    setLoading(true);
    try {
      const data = await api("/api/admin-session");
      setAuthenticated(data.authenticated);
    } catch {
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (!previewMode) checkSession(); }, [previewMode]);
  if (loading) return <div className="loading-screen"><Logo /><span>Opening your studio…</span></div>;
  return authenticated ? <StudioApp previewMode={previewMode} /> : <Login onAuthenticated={checkSession} />;
}

const studioRoot = window.__firststepStudioRoot || createRoot(document.getElementById("root"));
window.__firststepStudioRoot = studioRoot;
studioRoot.render(<Root />);
