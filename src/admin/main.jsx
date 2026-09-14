import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  CircleDollarSign,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  GripVertical,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Send,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  DEFAULT_CONTRACT_TEMPLATES,
  DEFAULT_PRICING_SETTINGS,
  DEFAULT_PRICING_STRUCTURES,
  assignClientToQuote,
  recordQuoteDelivery,
} from "../../lib/admin/workspaceModel.js";
import {
  AGREEMENT_CATEGORIES,
  AGREEMENT_DEPTHS,
  AGREEMENT_SECTION_LIBRARY,
  MAX_AGREEMENT_SECTIONS,
  agreementCoverage,
  sectionFromLibrary,
  sectionsForDepth,
} from "../../lib/admin/agreementLibrary.js";
import {
  PAYMENT_PLANS,
  paymentPlanLabel,
  paymentScheduleForQuote,
} from "../../lib/admin/paymentPlans.js";
import { draftQuoteFromBrief } from "../../lib/admin/quoteBriefAssistant.js";
import { CommandCenter, COMMAND_VIEWS } from "./CommandCenter.jsx";
import "./admin.css";

const DEFAULT_TEMPLATES = DEFAULT_CONTRACT_TEMPLATES;
const ADMIN_SESSION_EXPIRED_EVENT = "firststep:admin-session-expired";

const EMPTY_WORKSPACE = {
  revision: 0,
  updated_at: null,
  clients: [],
  quotes: [],
  templates: DEFAULT_TEMPLATES,
  pricing_structures: DEFAULT_PRICING_STRUCTURES,
  pricing_settings: DEFAULT_PRICING_SETTINGS,
};

const NAVIGATION = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "command-center", label: "Command Center", icon: Activity },
  { id: "job-agent", label: "Job Agent", icon: Activity },
  { id: "journey-requests", label: "Contact requests", icon: Mail },
  { id: "clients", label: "Clients", icon: Users },
  { id: "quotes", label: "Quotes", icon: FileText },
  { id: "pricing", label: "Pricing", icon: CircleDollarSign },
  { id: "contracts", label: "Contracts", icon: ScrollText },
  { id: "settings", label: "Settings", icon: Settings },
];

function commandViewFromPath() {
  const segment = window.location.pathname.match(/^\/admin\/(command-center|agents|projects|activity|audits|handoffs|decisions|releases|session-lifecycle)\/?$/)?.[1];
  return segment || null;
}

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

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function quoteNextStep(quote) {
  if (quote.status !== "sent") return `Valid ${formatDate(quote.valid_until)}`;
  if (!quote.follow_up_due) return "Follow-up not set";
  const today = new Date().toISOString().slice(0, 10);
  if (quote.follow_up_due < today) return `Overdue · ${formatDate(quote.follow_up_due)}`;
  if (quote.follow_up_due === today) return "Follow up today";
  return `Follow up ${formatDate(quote.follow_up_due)}`;
}

function pricingFloor(structure, settings) {
  const labor = (Number(structure.estimated_hours) || 0) * (Number(settings.target_hourly_rate) || 0);
  return labor * (1 + (Number(settings.contingency_percent) || 0) / 100);
}

function createPricingStructure() {
  return {
    id: recordId("pricing"),
    name: "New service",
    category: "website",
    billing_type: "project",
    starting_price: 0,
    typical_high: 0,
    estimated_hours: 1,
    summary: "",
    ideal_for: "",
    inclusions: "",
  };
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
    deposit_percent: 40,
    payment_plan: "three_payments",
    card_payments_enabled: true,
    payment_links: [],
    last_contacted_at: null,
    follow_up_due: "",
    follow_up_count: 0,
    notes: "Quote valid for 30 days. Third-party services are billed separately unless listed above.",
    contract_template_id: template.id,
    document_depth: template.document_depth || "standard",
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
  const template = DEFAULT_TEMPLATES.find((item) => item.id === "website-build") || DEFAULT_TEMPLATES[0];
  const quote = createQuote(client, template, 24, {
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
    if (response.status === 401 && path !== "/api/admin-session") {
      window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
    }
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

function Login({ onAuthenticated, mfaRequired, mobileTotpLoginAllowed }) {
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [useMobileTotpOnly, setUseMobileTotpOnly] = useState(false);

  useEffect(() => {
    setUseMobileTotpOnly(Boolean(mobileTotpLoginAllowed && mfaRequired));
  }, [mobileTotpLoginAllowed, mfaRequired]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const useTotpOnly = Boolean(useMobileTotpOnly && mfaRequired);
    let requestBody = JSON.stringify({
      password: useTotpOnly ? "" : password,
      otp,
      mobile_totp_login: useTotpOnly,
    });
    setPassword("");
    setOtp("");
    try {
      await api("/api/admin-session", {
        method: "POST",
        body: requestBody,
      });
      onAuthenticated();
    } catch (error) {
      setMessage(error.code === "invalid_credentials"
        ? (useTotpOnly
          ? "That authenticator code was not accepted."
          : "That password or authenticator code was not accepted.")
        : error.message);
    } finally {
      requestBody = "";
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
          {mobileTotpLoginAllowed && mfaRequired && (
            <div className="login-mode-note">
              <strong>{useMobileTotpOnly ? "Mobile 2FA-only access" : "Owner password mode"}</strong>
              <span>{useMobileTotpOnly
                ? "Use your authenticator code on mobile. Desktop still requires the owner password plus 2FA."
                : "Password mode is still available if you want the full desktop-style sign-in."}</span>
              <button
                type="button"
                className="login-mode-switch"
                onClick={() => setUseMobileTotpOnly((current) => !current)}
              >
                {useMobileTotpOnly ? "Use owner password instead" : "Use mobile 2FA only"}
              </button>
            </div>
          )}
          {!useMobileTotpOnly && (
            <>
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
            </>
          )}
          {mfaRequired && (
            <>
              <label htmlFor="studio-otp">Authenticator code</label>
              <input
                id="studio-otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                autoComplete="one-time-code"
                required
                autoFocus={useMobileTotpOnly}
              />
            </>
          )}
          {message && <p className="form-error" role="alert">{message}</p>}
          <button className="button primary full" type="submit" disabled={busy}>
            <ShieldCheck size={18} />
            {busy ? "Checking…" : (useMobileTotpOnly ? "Enter with 2FA code" : "Enter 1stStep Studio")}
          </button>
        </form>
        <p className="login-security"><ShieldCheck size={14} /> Owner-only access with signed sessions, encrypted client storage, and two-factor authentication.</p>
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
  const today = new Date().toISOString().slice(0, 10);
  const followUpsDue = workspace.quotes.filter(
    (quote) => quote.status === "sent" && quote.follow_up_due && quote.follow_up_due <= today
  ).length;
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
        <div><span>Follow-ups due</span><strong>{followUpsDue}</strong></div>
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
                  <span className={quote.status === "sent" && quote.follow_up_due && quote.follow_up_due < today ? "follow-up-overdue" : ""}>{quoteNextStep(quote)}</span>
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
  const [query, setQuery] = useState("");
  const selected = workspace.clients.find((client) => client.id === selectedId);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredClients = workspace.clients.filter((client) => (
    !normalizedQuery
    || [client.company, client.contact_name, client.email, client.phone, client.website]
      .some((value) => String(value || "").toLowerCase().includes(normalizedQuery))
  ));

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
        <div className="search-field"><Search size={16} /><input aria-label="Search clients" placeholder="Search clients" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="record-list">
          {filteredClients.map((client) => (
            <button key={client.id} className={client.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(client.id)}>
              <span className="client-monogram">{(client.company || client.contact_name || "?").slice(0, 1).toUpperCase()}</span>
              <span><strong>{client.company || "New client"}</strong><small>{client.contact_name || "Contact details needed"}</small></span>
            </button>
          ))}
          {workspace.clients.length > 0 && filteredClients.length === 0 && (
            <p className="list-empty">No clients match “{query.trim()}”.</p>
          )}
        </div>
      </section>
      <section className="editor-panel">
        {selected ? (
          <>
            <div className="section-heading"><div><h2>{selected.company || "New client"}</h2><p>These details appear on new quotes.</p></div></div>
            <div className="form-grid two">
              <Field label="Company" value={selected.company} onChange={(value) => updateClient("company", value)} />
              <Field label="Contact name" value={selected.contact_name} onChange={(value) => updateClient("contact_name", value)} />
              <Field label="Email" type="email" value={selected.email} help={selected.email && !validEmail(selected.email) ? "Enter a complete email before sending a quote." : ""} onChange={(value) => updateClient("email", value)} />
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
          <div className="table-head"><span>Project</span><span>Status</span><span>Value</span><span>Next step</span></div>
          {[...workspace.quotes].reverse().map((quote) => {
            const client = workspace.clients.find((item) => item.id === quote.client_id);
            return (
              <button key={quote.id} onClick={() => onEditQuote(quote.id)}>
                <div><strong>{quote.project_title || "Untitled project"}</strong><span>{client?.company || "Client details needed"} · {quote.quote_number}</span></div>
                <span className={`status ${quote.status}`}>{quote.status}</span>
                <strong>{currency(quoteTotal(quote))}</strong>
                <span className={quote.status === "sent" && quote.follow_up_due && quote.follow_up_due < new Date().toISOString().slice(0, 10) ? "follow-up-overdue" : ""}>{quoteNextStep(quote)}</span>
              </button>
            );
          })}
        </div>
      ) : <EmptyState icon={FileText} title="Create your first quote" body="Start with a reusable agreement structure, then add the exact scope and price for this client." action={onNewQuote} actionLabel="Create a quote" />}
    </div>
  );
}

function PricingPage({ workspace, updateWorkspace, onStartQuote }) {
  const structures = workspace.pricing_structures || DEFAULT_PRICING_STRUCTURES;
  const settings = workspace.pricing_settings || DEFAULT_PRICING_SETTINGS;
  const [selectedId, setSelectedId] = useState(structures[0]?.id || null);
  const selected = structures.find((structure) => structure.id === selectedId) || structures[0];

  function updateStructure(patch) {
    if (!selected) return;
    updateWorkspace((current) => ({
      ...current,
      pricing_structures: (current.pricing_structures || DEFAULT_PRICING_STRUCTURES).map((structure) => {
        if (structure.id !== selected.id) return structure;
        const next = { ...structure, ...patch };
        if ("starting_price" in patch && Number(next.typical_high) < Number(next.starting_price)) {
          next.typical_high = next.starting_price;
        }
        if ("typical_high" in patch && Number(next.typical_high) < Number(next.starting_price)) {
          next.typical_high = next.starting_price;
        }
        return next;
      }),
    }));
  }

  function updateSettings(field, value) {
    updateWorkspace((current) => ({
      ...current,
      pricing_settings: {
        ...(current.pricing_settings || DEFAULT_PRICING_SETTINGS),
        [field]: value,
      },
    }));
  }

  function addStructure() {
    const structure = createPricingStructure();
    updateWorkspace((current) => ({
      ...current,
      pricing_structures: [...(current.pricing_structures || DEFAULT_PRICING_STRUCTURES), structure],
    }));
    setSelectedId(structure.id);
  }

  function removeStructure() {
    if (!selected || structures.length <= 1) return;
    const next = structures.filter((structure) => structure.id !== selected.id);
    updateWorkspace((current) => ({ ...current, pricing_structures: next }));
    setSelectedId(next[0]?.id || null);
  }

  const floor = selected ? pricingFloor(selected, settings) : 0;
  const discountedPrice = selected
    ? Number(selected.starting_price || 0) * (1 - Number(settings.max_discount_percent || 0) / 100)
    : 0;
  const effectiveRate = selected
    ? discountedPrice / Math.max(Number(selected.estimated_hours) || 1, 1)
    : 0;
  const healthy = discountedPrice >= floor;

  return (
    <div className="page-content pricing-page">
      <div className="section-heading page-heading">
        <div><h2>Pricing structures</h2><p>Introductory solo-studio pricing that stays approachable while protecting a minimum delivery floor.</p></div>
        <button className="button" onClick={addStructure}><Plus size={16} />Add service</button>
      </div>

      <section className="pricing-guidance">
        <CircleDollarSign size={30} />
        <div>
          <strong>Founding-client prices. Raise them as proof grows.</strong>
          <p>Use these rates to win your first 3–5 verified launches. Keep the free offer to a fit check—not the implementation—then review pricing as your case-study proof and demand grow.</p>
        </div>
        <div className="pricing-principles">
          <span><b>Entry</b> Low-risk sprint</span>
          <span><b>Core</b> Custom build</span>
          <span><b>Premium</b> Motion or app</span>
        </div>
      </section>

      <div className="pricing-layout">
        <aside className="pricing-book">
          <div className="rail-title"><h2>Price book</h2><span>{structures.length}</span></div>
          <div className="pricing-records">
            {structures.map((structure) => (
              <button
                key={structure.id}
                className={structure.id === selected?.id ? "selected" : ""}
                onClick={() => setSelectedId(structure.id)}
              >
                <span><strong>{structure.name}</strong><small>{structure.category} · {structure.billing_type}</small></span>
                <b>{currency(structure.starting_price)}{structure.billing_type === "monthly" ? "/mo" : "+"}</b>
              </button>
            ))}
          </div>
        </aside>

        <section className="pricing-editor">
          {selected ? (
            <>
              <div className="pricing-editor-head">
                <div>
                  <span>{selected.category} · {selected.billing_type}</span>
                  <h2>{selected.name}</h2>
                  <p>{selected.summary || "Add a concise description for this offer."}</p>
                </div>
                <div className={`price-health ${healthy ? "healthy" : "warning"}`}>
                  {healthy ? <Check size={16} /> : <X size={16} />}
                  {healthy ? "Floor protected" : "Below your floor"}
                </div>
              </div>

              <div className="pricing-form-grid">
                <Field label="Service name" value={selected.name} onChange={(value) => updateStructure({ name: value })} />
                <label className="field">Category
                  <select value={selected.category} onChange={(event) => updateStructure({ category: event.target.value })}>
                    <option value="website">Website</option>
                    <option value="app">App</option>
                    <option value="recurring">Recurring</option>
                  </select>
                </label>
                <label className="field">Billing
                  <select value={selected.billing_type} onChange={(event) => updateStructure({ billing_type: event.target.value })}>
                    <option value="project">One-time project</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <Field label="Starting price" type="number" min="0" step="50" value={selected.starting_price} onChange={(value) => updateStructure({ starting_price: Number(value) })} />
                <Field label="Typical high" type="number" min={selected.starting_price} step="50" value={selected.typical_high} onChange={(value) => updateStructure({ typical_high: Number(value) })} />
                <Field label="Estimated delivery hours" type="number" min="0.25" step="0.25" value={selected.estimated_hours} onChange={(value) => updateStructure({ estimated_hours: Number(value) })} />
              </div>

              <div className="pricing-copy-grid">
                <Field label="Summary" multiline value={selected.summary} onChange={(value) => updateStructure({ summary: value })} />
                <Field label="Best fit" multiline value={selected.ideal_for} onChange={(value) => updateStructure({ ideal_for: value })} />
                <Field label="Included scope — one item per line" multiline value={selected.inclusions} onChange={(value) => updateStructure({ inclusions: value })} />
              </div>

              <section className="pricing-calculator">
                <div className="calculator-copy">
                  <h3>Profitability guardrail</h3>
                  <p>This stays internal. It checks the lowest advertised price after your maximum discount against time and delivery risk.</p>
                </div>
                <div className="calculator-settings">
                  <Field label="Target hourly floor" type="number" min="25" step="5" value={settings.target_hourly_rate} onChange={(value) => updateSettings("target_hourly_rate", Number(value))} />
                  <Field label="Contingency" type="number" min="0" max="100" step="1" value={settings.contingency_percent} onChange={(value) => updateSettings("contingency_percent", Number(value))} help="Percent" />
                  <Field label="Maximum discount" type="number" min="0" max="50" step="1" value={settings.max_discount_percent} onChange={(value) => updateSettings("max_discount_percent", Number(value))} help="Percent" />
                  <Field label="Default deposit" type="number" min="0" max="100" step="5" value={settings.default_deposit_percent} onChange={(value) => updateSettings("default_deposit_percent", Number(value))} help="Percent" />
                </div>
                <div className="calculator-results">
                  <div><span>Minimum healthy price</span><strong>{currency(floor)}</strong></div>
                  <div><span>After max discount</span><strong>{currency(discountedPrice)}</strong></div>
                  <div><span>Effective hourly rate</span><strong>{currency(effectiveRate)}</strong></div>
                  <div className={healthy ? "positive" : "negative"}><span>Room above floor</span><strong>{currency(discountedPrice - floor)}</strong></div>
                </div>
              </section>

              <div className="pricing-actions">
                <button className="button danger-button" onClick={removeStructure} disabled={structures.length <= 1}><Trash2 size={15} />Delete structure</button>
                <button className="button primary" onClick={() => onStartQuote(selected)}><FileText size={16} />Create quote from this</button>
              </div>
            </>
          ) : <EmptyState icon={CircleDollarSign} title="Build your price book" body="Add a service structure, define your internal floor, and turn it into a quote." action={addStructure} actionLabel="Add a service" />}
        </section>
      </div>
    </div>
  );
}

function AgreementCoveragePanel({ sections }) {
  const coverage = agreementCoverage(sections);
  const percent = Math.round((coverage.completed / coverage.total) * 100);
  return (
    <div className={coverage.missing.length ? "agreement-coverage incomplete" : "agreement-coverage complete"}>
      <div className="agreement-coverage-heading">
        <span>Core agreement coverage</span>
        <strong>{coverage.completed}/{coverage.total}</strong>
      </div>
      <progress className="agreement-coverage-track" value={percent} max="100" aria-label="Agreement coverage" />
      {coverage.missing.length ? (
        <p>Still review: {coverage.missing.map((item) => item.label).join(", ")}.</p>
      ) : (
        <p><Check size={13} /> Scope, payment, ownership, approvals, and exit terms are represented.</p>
      )}
    </div>
  );
}

function AgreementDepthControl({ depth, serviceType, onApply }) {
  const [selectedDepth, setSelectedDepth] = useState(depth || "standard");
  useEffect(() => setSelectedDepth(depth || "standard"), [depth]);
  const selected = AGREEMENT_DEPTHS.find((item) => item.id === selectedDepth) || AGREEMENT_DEPTHS[1];
  const sectionCount = sectionsForDepth(selected.id, serviceType).length;
  return (
    <div className="agreement-depth-control">
      <label className="select-field">
        <span>Document detail</span>
        <select value={selectedDepth} onChange={(event) => setSelectedDepth(event.target.value)}>
          {AGREEMENT_DEPTHS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <ChevronDown size={15} />
      </label>
      <p>{selected.description} <strong>{sectionCount} clauses</strong></p>
      <button className="button compact" type="button" onClick={() => onApply(selectedDepth)}>
        <ScrollText size={14} />Build this clause set
      </button>
      <small>Replaces the current clauses. You can edit or remove any clause afterward.</small>
    </div>
  );
}

function ClauseLibraryPicker({ sections, serviceType, onAdd }) {
  const available = sections.length >= MAX_AGREEMENT_SECTIONS ? [] : AGREEMENT_SECTION_LIBRARY.filter((section) => (
    !sections.some((item) => item.id === section.id)
    && (section.appliesTo.includes("all") || section.appliesTo.includes(serviceType))
  ));
  const [selectedId, setSelectedId] = useState(available[0]?.id || "");
  useEffect(() => {
    if (!available.some((section) => section.id === selectedId)) setSelectedId(available[0]?.id || "");
  }, [available, selectedId]);

  return (
    <div className="clause-library-picker">
      <div><strong>Add from clause library</strong><span>{available.length} available</span></div>
      <div>
        <select aria-label="Clause library" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={!available.length}>
          {Object.entries(AGREEMENT_CATEGORIES).map(([category, label]) => {
            const items = available.filter((section) => section.category === category);
            return items.length ? (
              <optgroup key={category} label={label}>
                {items.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
        <button className="button compact" type="button" disabled={!selectedId} onClick={() => {
          const section = sectionFromLibrary(selectedId);
          if (section) onAdd(section);
        }}><Plus size={14} />Add</button>
      </div>
    </div>
  );
}

function ContractsPage({ workspace, updateWorkspace }) {
  const [selectedId, setSelectedId] = useState(workspace.templates[0]?.id || null);
  const [presetId, setPresetId] = useState(DEFAULT_CONTRACT_TEMPLATES[0].id);
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
      document_depth: "essential",
      service_type: "website",
      description: "Custom agreement structure.",
      sections: sectionsForDepth("essential", "website"),
    };
    updateWorkspace((current) => ({ ...current, templates: [...current.templates, template] }));
    setSelectedId(template.id);
  }

  function addPreset() {
    const existing = workspace.templates.find((template) => template.id === presetId);
    if (existing) {
      setSelectedId(existing.id);
      return;
    }
    const preset = DEFAULT_CONTRACT_TEMPLATES.find((template) => template.id === presetId);
    if (!preset) return;
    updateWorkspace((current) => ({ ...current, templates: [...current.templates, structuredClone(preset)] }));
    setSelectedId(preset.id);
  }

  return (
    <div className="page-content split-page contracts-page">
      <section className="list-panel">
        <div className="section-heading"><div><h2>Agreement library</h2><p>From a quick approval to a detailed services agreement.</p></div></div>
        <div className="preset-import">
          <label>Studio presets</label>
          <select value={presetId} onChange={(event) => setPresetId(event.target.value)}>
            {DEFAULT_CONTRACT_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
          <button className="button compact full" type="button" onClick={addPreset}><Plus size={15} />Add or open preset</button>
        </div>
        <div className="record-list template-list">
          {workspace.templates.map((template) => (
            <button key={template.id} className={template.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(template.id)}>
              <span className="client-monogram"><ScrollText size={16} /></span>
              <span><strong>{template.name}</strong><small>{AGREEMENT_DEPTHS.find((item) => item.id === template.document_depth)?.label || "Professional"} · {template.sections.length} clauses</small></span>
            </button>
          ))}
        </div>
        <button className="button compact full" onClick={addTemplate}><Plus size={16} />New custom structure</button>
      </section>
      <section className="editor-panel">
        {selected && (
          <>
            <div className="section-heading">
              <div><h2>{selected.name}</h2><p>Practical drafting language only—have your attorney review final terms before client use.</p></div>
            </div>
            <div className="template-meta-grid">
              <Field label="Structure name" value={selected.name} onChange={(value) => updateTemplate((template) => ({ ...template, name: value }))} />
              <label className="field"><span>Service type</span><select value={selected.service_type || "website"} onChange={(event) => updateTemplate((template) => ({ ...template, service_type: event.target.value }))}>
                <option value="website">Website / web app</option>
                <option value="app">iOS / mobile app</option>
                <option value="retainer">Care plan / retainer</option>
              </select></label>
            </div>
            <Field label="Internal description" value={selected.description || ""} onChange={(value) => updateTemplate((template) => ({ ...template, description: value }))} />
            <div className="agreement-builder-tools">
              <AgreementDepthControl
                depth={selected.document_depth}
                serviceType={selected.service_type || "website"}
                onApply={(documentDepth) => updateTemplate((template) => ({
                  ...template,
                  document_depth: documentDepth,
                  sections: sectionsForDepth(documentDepth, template.service_type || "website"),
                }))}
              />
              <AgreementCoveragePanel sections={selected.sections} />
              <ClauseLibraryPicker
                sections={selected.sections}
                serviceType={selected.service_type || "website"}
                onAdd={(section) => updateTemplate((template) => ({ ...template, sections: [...template.sections, section] }))}
              />
            </div>
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
                  <div className="template-section-meta">
                    <select aria-label={`${section.title} category`} value={section.category || "scope"} onChange={(event) => updateTemplate((template) => ({
                      ...template,
                      sections: template.sections.map((item) => item.id === section.id ? { ...item, category: event.target.value } : item),
                    }))}>
                      {Object.entries(AGREEMENT_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <label className="toggle"><input type="checkbox" checked={section.enabled !== false} onChange={(event) => updateTemplate((template) => ({
                      ...template,
                      sections: template.sections.map((item) => item.id === section.id ? { ...item, enabled: event.target.checked } : item),
                    }))} /><span />Enabled by default</label>
                  </div>
                  <textarea aria-label={`${section.title} language`} value={section.body} rows={5} onChange={(event) => updateTemplate((template) => ({
                    ...template,
                    sections: template.sections.map((item) => item.id === section.id ? { ...item, body: event.target.value } : item),
                  }))} />
                  <label className="internal-guidance"><span>Internal drafting note</span><textarea value={section.guidance || ""} rows={2} onChange={(event) => updateTemplate((template) => ({
                    ...template,
                    sections: template.sections.map((item) => item.id === section.id ? { ...item, guidance: event.target.value } : item),
                  }))} /></label>
                </article>
              ))}
              <button className="button compact" disabled={selected.sections.length >= MAX_AGREEMENT_SECTIONS} onClick={() => updateTemplate((template) => ({
                ...template,
                sections: [...template.sections, { id: recordId("section"), title: "New section", body: "", category: "scope", guidance: "", enabled: true }],
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
        <div><strong>Owner-only access</strong><p>Production requires a hashed owner password plus an authenticator code. The signed HTTP-only session expires after two hours, and the admin cannot be framed or indexed.</p></div>
        <span className="health">{previewMode ? "Local preview" : "Protected"}</span>
      </section>
      <section className="settings-band">
        <Save />
        <div><strong>Encrypted workspace storage</strong><p>Client records, quotes, and agreement terms are sealed with AES-256-GCM before they reach private Vercel KV. Revision checks also prevent silent overwrites.</p></div>
        <span>{workspace.updated_at ? `Saved ${new Date(workspace.updated_at).toLocaleString()}` : "Not saved yet"}</span>
      </section>
      <section className="settings-band">
        <CreditCard />
        <div><strong>Stripe card payments</strong><p>Each quote installment can receive a single-use Stripe-hosted payment link. Stripe handles card details, receipts, wallets, and any eligible financing methods.</p></div>
        <span>{previewMode ? "Production connection required" : "Fail-closed until connected"}</span>
      </section>
      <section className="settings-band caution">
        <ScrollText />
        <div><strong>Contract language review</strong><p>The included structures are practical drafting starters, not legal advice. Have qualified counsel review your final terms for your business and jurisdiction.</p></div>
      </section>
    </div>
  );
}

function moneyFromCents(value) {
  if (value === null || value === undefined) return "Unknown";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) / 100);
}

function operationsStatusClass(status) {
  if (["healthy", "ready", "running", "idle", "succeeded", "enabled"].includes(status)) return "healthy";
  if (["disabled", "blocked"].includes(status)) return "guarded";
  if (["failed", "degraded"].includes(status)) return "attention";
  return "unknown";
}

function JourneyRequestsPage({ previewMode }) {
  const [requests, setRequests] = useState([]);
  const [cursor, setCursor] = useState("0");
  const [roastRequests, setRoastRequests] = useState([]);
  const [roastCursor, setRoastCursor] = useState("0");
  const [roastError, setRoastError] = useState(previewMode ? "Live OS requests are unavailable in admin preview mode." : "");
  const [setupRequests, setSetupRequests] = useState([]);
  const [setupCursor, setSetupCursor] = useState("0");
  const [setupError, setSetupError] = useState(previewMode ? "Live OS setup requests are unavailable in admin preview mode." : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(previewMode ? "Live requests are unavailable in admin preview mode." : "");

  async function load(nextCursor = "0") {
    if (previewMode) return;
    setLoading(true);
    setError("");
    try {
      const data = await api(`/api/admin-journey-requests?cursor=${encodeURIComponent(nextCursor)}`);
      setRequests(nextCursor === "0" ? data.requests : (current) => [...current, ...data.requests]);
      setCursor(data.cursor);
    } catch (requestError) {
      setError(requestError.message || "Journey requests could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRoastRequests(nextCursor = "0") {
    if (previewMode) return;
    setRoastError("");
    try {
      const data = await api(`/api/admin-os-roast-requests?cursor=${encodeURIComponent(nextCursor)}`);
      setRoastRequests(nextCursor === "0" ? data.requests : (current) => [...current, ...data.requests]);
      setRoastCursor(data.cursor);
    } catch (requestError) {
      setRoastError(requestError.message || "OS first-look requests could not be loaded.");
    }
  }

  async function loadSetupRequests(nextCursor = "0") {
    if (previewMode) return;
    setSetupError("");
    try {
      const data = await api(`/api/admin-os-setup-requests?cursor=${encodeURIComponent(nextCursor)}`);
      setSetupRequests(nextCursor === "0" ? data.requests : (current) => [...current, ...data.requests]);
      setSetupCursor(data.cursor);
    } catch (requestError) {
      setSetupError(requestError.message || "OS setup requests could not be loaded.");
    }
  }

  useEffect(() => { load(); loadRoastRequests(); loadSetupRequests(); }, [previewMode]);

  return (
    <div className="page-content">
      <div className="section-heading page-heading"><div><h2>Contact requests</h2><p>Consented systems-diagnosis, OS first-look, and OS setup inquiries. A saved request is a lead receipt, not an audit, setup order, or booked meeting.</p></div><button className="button" type="button" onClick={() => { load(); loadRoastRequests(); loadSetupRequests(); }} disabled={loading || previewMode}><RefreshCw size={16} />Refresh</button></div>
      <h3>OS setup inquiries</h3>
      {setupError && <section className="operations-unavailable" role="status"><AlertTriangle size={20} /><div><strong>OS setup requests unavailable</strong><p>{setupError}</p></div></section>}
      {!setupError && setupRequests.length === 0 && <p>No saved OS setup requests found in this scan.</p>}
      {setupRequests.map((request) => <section className="operations-panel" key={request.request_id}>
        <h3>Scoped OS setup inquiry</h3>
        <p><strong>Contact:</strong> <a href={`mailto:${request.email}`}>{request.email}</a> · <strong>Received:</strong> {new Date(request.created_at).toLocaleString()} · <strong>Reference:</strong> {request.request_id}</p>
        {request.target && <p><strong>Public link:</strong> {request.target}</p>}
        {request.first_look_request_id && <p><strong>First-look reference:</strong> {request.first_look_request_id} (visitor supplied)</p>}
        <p><strong>Goal:</strong> {request.goal}</p>
        <dl>{Object.entries(request.answers).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
      </section>)}
      {setupCursor !== "0" && <button className="button" type="button" onClick={() => loadSetupRequests(setupCursor)}>Load more OS setup requests</button>}
      <h3>OS public first looks</h3>
      {roastError && <section className="operations-unavailable" role="status"><AlertTriangle size={20} /><div><strong>OS requests unavailable</strong><p>{roastError}</p></div></section>}
      {!roastError && roastRequests.length === 0 && <p>No saved OS first-look requests found in this scan.</p>}
      {roastRequests.map((request) => <section className="operations-panel" key={request.request_id}>
        <h3>{request.kind === "github" ? "Public GitHub first look" : "Public website first look"}</h3>
        <p><strong>Contact:</strong> <a href={`mailto:${request.email}`}>{request.email}</a> · <strong>Received:</strong> {new Date(request.created_at).toLocaleString()} · <strong>Reference:</strong> {request.request_id}</p>
        <p><strong>Public link:</strong> {request.target}</p>
        <p><strong>Optional marketing:</strong> {request.marketing_opt_in ? `Requested updates · ${request.marketing_consent_version || "wording unknown"} · not synced to Brevo` : "No marketing opt-in"}</p>
      </section>)}
      {roastCursor !== "0" && <button className="button" type="button" onClick={() => loadRoastRequests(roastCursor)}>Load more OS requests</button>}
      <h3>Begin Your Journey</h3>
      {error && <section className="operations-unavailable" role="status"><AlertTriangle size={20} /><div><strong>Requests unavailable</strong><p>{error}</p></div></section>}
      {!error && !loading && requests.length === 0 && <p>No saved requests found in this scan. Additional pages may exist if a cursor is available.</p>}
      {requests.map((request) => <section className="operations-panel" key={request.request_id}>
        <h3>{request.answers.business}</h3>
        <p><strong>Contact:</strong> <a href={`mailto:${request.email}`}>{request.email}</a> · <strong>Received:</strong> {new Date(request.created_at).toLocaleString()} · <strong>Reference:</strong> {request.request_id}</p>
        <dl>{Object.entries(request.answers).filter(([, value]) => value).map(([name, value]) => <div key={name}><dt>{name.replaceAll("_", " ")}</dt><dd>{value}</dd></div>)}</dl>
        <p><strong>Attribution:</strong> {Object.entries(request.attribution).filter(([, value]) => value).map(([name, value]) => `${name}=${value}`).join(" · ") || "Unknown"}</p>
      </section>)}
      {cursor !== "0" && <button className="button" type="button" onClick={() => load(cursor)} disabled={loading}>Load more</button>}
    </div>
  );
}

function JobAgentOperationsPage({ previewMode }) {
  const [operations, setOperations] = useState(null);
  const [loading, setLoading] = useState(!previewMode);
  const [error, setError] = useState(previewMode ? "Live operations appear only in the protected production admin." : "");

  async function loadOperations() {
    if (previewMode) return;
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/admin-job-agent-operations");
      setOperations(data.operations);
    } catch (requestError) {
      setOperations(null);
      setError(requestError.message || "Live Job Agent operations are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOperations();
    if (previewMode) return undefined;
    const timer = window.setInterval(loadOperations, 60_000);
    return () => window.clearInterval(timer);
  }, [previewMode]);

  return (
    <div className="page-content operations-page">
      <div className="section-heading page-heading operations-heading">
        <div>
          <h2>Job Agent operations</h2>
          <p>Live costs, queues, safeguards, and outage reporting. Aggregate operational data only.</p>
        </div>
        <button className="button" type="button" onClick={loadOperations} disabled={loading || previewMode}>
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {error && (
        <section className="operations-unavailable" role="status">
          <AlertTriangle size={20} />
          <div><strong>Live operations unavailable</strong><p>{error} No healthy status is assumed while data is unavailable.</p></div>
        </section>
      )}

      {operations && (
        <>
          <section className="operations-summary" aria-label="Job Agent cost and health summary">
            <article><span>Spent today</span><strong>{moneyFromCents(operations.spend.settledCents)}</strong><small>{operations.spend.ledgerDate || "Current UTC day"}</small></article>
            <article><span>Reserved</span><strong>{moneyFromCents(operations.spend.reservedCents)}</strong><small>Work started, not settled</small></article>
            <article><span>Budget remaining</span><strong>{moneyFromCents(operations.spend.remainingCents)}</strong><small>Daily ceiling {moneyFromCents(operations.spend.dailyCapCents)}</small></article>
            <article><span>Background worker</span><strong className={operationsStatusClass(operations.worker.status)}>{operations.worker.status}</strong><small>{operations.worker.lastSeenAt ? `Last seen ${new Date(operations.worker.lastSeenAt).toLocaleString()}` : "Last heartbeat unknown"}</small></article>
          </section>

          <section className="operations-columns">
            <div className="operations-panel">
              <div className="operations-panel-title"><div><h3>Cost by capability</h3><p>Ledger totals and hard ceilings.</p></div><CircleDollarSign size={20} /></div>
              <div className="operations-list">
                {operations.spend.categories.map((category) => (
                  <article key={category.key}>
                    <div><strong>{category.label}</strong><small>{category.guarded ? `Guarded · ${moneyFromCents(category.dailyCapCents)} daily cap` : "Inactive or no approved ceiling"}</small></div>
                    <span>{moneyFromCents(category.settledCents + category.reservedCents)}</span>
                  </article>
                ))}
              </div>
              <p className="operations-evidence">{operations.spend.evidenceNote}</p>
            </div>

            <div className="operations-panel">
              <div className="operations-panel-title"><div><h3>Work queues</h3><p>Pending and overdue background work.</p></div><Activity size={20} /></div>
              <div className="operations-list queue-list">
                {operations.queues.map((queue) => (
                  <article key={queue.key}>
                    <div><strong>{queue.label}</strong><small>Pending {queue.pending ?? "unknown"} · Overdue {queue.overdue ?? "unknown"}</small></div>
                    <span className={`operations-chip ${operationsStatusClass(queue.status)}`}>{queue.status}</span>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="operations-panel safeguards-panel">
            <div className="operations-panel-title"><div><h3>Safety controls</h3><p>Capabilities remain unavailable unless every required control is satisfied.</p></div><ShieldCheck size={20} /></div>
            <div className="safeguard-grid">
              <div><span>Employer browser</span><strong className={operationsStatusClass(operations.safeguards.employerBrowser)}>{operations.safeguards.employerBrowser}</strong></div>
              <div><span>Final submission</span><strong className={operationsStatusClass(operations.safeguards.finalSubmission)}>{operations.safeguards.finalSubmission}</strong></div>
              <div><span>Application preparation</span><strong className={operationsStatusClass(operations.safeguards.packagePreparation)}>{operations.safeguards.packagePreparation}</strong></div>
              <div><span>Discord alerts</span><strong className={operations.alerts.discordReady ? "healthy" : "attention"}>{operations.alerts.destination}</strong></div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  multiline = false,
  min,
  max,
  step,
  help,
  disabled = false,
}) {
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
        disabled={disabled}
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

function LineItems({ quote, updateQuote, pricingLocked }) {
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
      <div className="document-section-heading"><h2>Scope & pricing</h2><button className="button compact" disabled={pricingLocked} onClick={() => updateQuote({
        line_items: [...quote.line_items, { id: recordId("item"), name: "", description: "", quantity: 1, rate: 0 }],
      })}><Plus size={15} />Add line item</button></div>
      <div className="line-items">
        <div className="line-head"><span /><span>Item</span><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span><span /></div>
        {quote.line_items.map((item, index) => (
          <div className="line-row" key={item.id}>
            <GripVertical size={15} />
            <input aria-label={`Line item ${index + 1} name`} value={item.name} disabled={pricingLocked} onChange={(event) => updateItem(item.id, "name", event.target.value)} />
            <input aria-label={`Line item ${index + 1} description`} value={item.description} disabled={pricingLocked} onChange={(event) => updateItem(item.id, "description", event.target.value)} />
            <input aria-label={`Line item ${index + 1} quantity`} type="number" min="0" step="0.25" value={item.quantity} disabled={pricingLocked} onChange={(event) => updateItem(item.id, "quantity", event.target.value)} />
            <input aria-label={`Line item ${index + 1} rate`} type="number" min="0" step="50" value={item.rate} disabled={pricingLocked} onChange={(event) => updateItem(item.id, "rate", event.target.value)} />
            <strong>{currency(item.quantity * item.rate)}</strong>
            <button className="icon-button danger" disabled={pricingLocked} aria-label={`Delete ${item.name || "line item"}`} onClick={() => updateQuote({
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
  const selectedTemplate = templates.find((item) => item.id === quote.contract_template_id);
  const serviceType = selectedTemplate?.service_type || "website";

  function selectTemplate(templateId) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    updateQuote({
      contract_template_id: template.id,
      document_depth: template.document_depth || "standard",
      contract_sections: structuredClone(template.sections),
    });
    setOpenSection(template.sections[0]?.id || null);
  }

  function applyDepth(documentDepth) {
    const sections = sectionsForDepth(documentDepth, serviceType);
    updateQuote({ document_depth: documentDepth, contract_sections: sections });
    setOpenSection(sections[0]?.id || null);
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
      <AgreementDepthControl
        depth={quote.document_depth}
        serviceType={serviceType}
        onApply={applyDepth}
      />
      <AgreementCoveragePanel sections={quote.contract_sections} />
      <div className="contract-sections">
        {quote.contract_sections.map((section) => {
          const open = openSection === section.id;
          return (
            <article key={section.id} className={open ? "open" : ""}>
              <button className="contract-section-toggle" onClick={() => setOpenSection(open ? null : section.id)}>
                <span className="section-symbol">{section.title.slice(0, 1)}</span>
                <span><strong>{section.title}</strong><small>{AGREEMENT_CATEGORIES[section.category] || "Custom"} · {section.enabled ? "Included" : "Excluded"}</small></span>
                <ChevronDown size={16} />
              </button>
              {open && (
                <div className="contract-section-body">
                  <label className="toggle"><input type="checkbox" checked={section.enabled} onChange={(event) => updateSection(section.id, { enabled: event.target.checked })} /><span />Include in quote</label>
                  <input aria-label={`${section.title} title`} value={section.title} onChange={(event) => updateSection(section.id, { title: event.target.value })} />
                  <textarea aria-label={`${section.title} terms`} value={section.body} rows={6} onChange={(event) => updateSection(section.id, { body: event.target.value })} />
                  {section.guidance && <p className="drafting-guidance"><strong>Internal note</strong>{section.guidance}</p>}
                  <button className="button compact danger-button" type="button" onClick={() => {
                    updateQuote({ contract_sections: quote.contract_sections.filter((item) => item.id !== section.id) });
                    setOpenSection(null);
                  }}><Trash2 size={14} />Remove clause</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <ClauseLibraryPicker
        sections={quote.contract_sections}
        serviceType={serviceType}
        onAdd={(section) => {
          updateQuote({ contract_sections: [...quote.contract_sections, section] });
          setOpenSection(section.id);
        }}
      />
      <button className="button compact full" disabled={quote.contract_sections.length >= MAX_AGREEMENT_SECTIONS} onClick={() => {
        const section = { id: recordId("section"), title: "New section", body: "", category: "scope", guidance: "", enabled: true };
        updateQuote({ contract_sections: [...quote.contract_sections, section] });
        setOpenSection(section.id);
      }}><Plus size={15} />Add section</button>
    </aside>
  );
}

function PaymentPlanEditor({
  quote,
  updateQuote,
  onCreatePaymentLink,
  onDeactivatePaymentLinks,
  previewMode,
}) {
  const schedule = paymentScheduleForQuote(quote);
  const pricingLocked = (quote.payment_links || []).length > 0;
  const [creatingInstallment, setCreatingInstallment] = useState(null);
  const [deactivating, setDeactivating] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");

  async function createLink(installmentNumber) {
    setCreatingInstallment(installmentNumber);
    setPaymentMessage("");
    try {
      await onCreatePaymentLink(
        quote.id,
        installmentNumber,
        `payment-link/${quote.id}/${installmentNumber}/${crypto.randomUUID()}`
      );
      setPaymentMessage("Secure Stripe link created and added to this quote.");
    } catch (error) {
      setPaymentMessage(error.message);
    } finally {
      setCreatingInstallment(null);
    }
  }

  function selectPlan(paymentPlan) {
    const depositByPlan = {
      full: 100,
      two_payments: 50,
      three_payments: 40,
      four_monthly: 25,
    };
    updateQuote({
      payment_plan: paymentPlan,
      deposit_percent: depositByPlan[paymentPlan],
    });
    setPaymentMessage("");
  }

  async function deactivateLinks() {
    setDeactivating(true);
    setPaymentMessage("");
    try {
      const result = await onDeactivatePaymentLinks(quote.id);
      setPaymentMessage(`${result.deactivated} card link${result.deactivated === 1 ? "" : "s"} deactivated. Pricing can now be edited safely.`);
    } catch (error) {
      setPaymentMessage(error.message);
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <section className="document-section payment-plan-section">
      <div className="document-section-heading">
        <div><h2>Payment options</h2><p>Credit card is the preferred option. Offer flexibility without lowering the project price.</p></div>
        <CreditCard size={19} />
      </div>
      <div className="payment-plan-controls">
        <label className="select-field">Payment plan
          <select
            aria-label="Payment plan"
            value={quote.payment_plan || "three_payments"}
            disabled={pricingLocked}
            onChange={(event) => selectPlan(event.target.value)}
          >
            {PAYMENT_PLANS.map((plan) => <option key={plan.id} value={plan.id}>{plan.label}</option>)}
          </select>
          <ChevronDown size={14} />
        </label>
        <div className="card-payment-note">
          <CreditCard size={20} />
          <div><strong>Secure card checkout</strong><span>Stripe can show credit/debit cards, Apple Pay, Google Pay, and eligible financing methods. Card details never touch this website.</span></div>
        </div>
      </div>
      {pricingLocked && (
        <div className="payment-lock-warning" role="status">
          <ShieldCheck size={18} />
          <div>
            <strong>Pricing is locked while card links are active.</strong>
            <span>Deactivate the existing Stripe links before changing totals, the project title, or the payment schedule.</span>
          </div>
          <button className="button compact danger-button" type="button" disabled={deactivating} onClick={deactivateLinks}>
            {deactivating ? "Deactivating…" : "Deactivate card links"}
          </button>
        </div>
      )}
      <div className="payment-schedule">
        {schedule.map((installment) => {
          const paymentLink = (quote.payment_links || []).find(
            (link) => Number(link.installment_number) === installment.installment_number
          );
          return (
            <article key={installment.installment_number}>
              <span>{installment.installment_number}</span>
              <div><strong>{installment.label}</strong><small>{installment.due}</small></div>
              <b>{currency(installment.amount)}</b>
              {paymentLink ? (
                <a className="button payment-link-button" href={paymentLink.url} target="_blank" rel="noreferrer">
                  Open link <ExternalLink size={13} />
                </a>
              ) : (
                <button
                  className="button payment-link-button"
                  disabled={previewMode || creatingInstallment === installment.installment_number}
                  onClick={() => createLink(installment.installment_number)}
                >
                  <CreditCard size={14} />
                  {creatingInstallment === installment.installment_number ? "Creating…" : "Create card link"}
                </button>
              )}
            </article>
          );
        })}
      </div>
      {previewMode && <p className="payment-feedback">Local preview shows the full workflow. Real Stripe links are created only inside the protected production admin.</p>}
      {paymentMessage && <p className="payment-feedback" role="status">{paymentMessage}</p>}
    </section>
  );
}

function QuoteBriefAssistant({ workspace, quote, updateQuote, pricingLocked }) {
  const [brief, setBrief] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function populateQuote() {
    if (pricingLocked) {
      setError("Deactivate the active card links before replacing this quote.");
      return;
    }
    try {
      const draft = draftQuoteFromBrief(brief, workspace.pricing_structures);
      const exactTemplate = workspace.templates.find((template) => template.id === draft.template_id);
      const compatibleTemplate = workspace.templates.find((template) => (
        template.service_type === draft.service_type
        && template.document_depth === draft.document_depth
      ));
      const currentTemplate = workspace.templates.find((template) => template.id === quote.contract_template_id);
      const template = exactTemplate || compatibleTemplate || currentTemplate || workspace.templates[0];
      if (!template) throw new Error("Add an agreement structure before building this quote.");

      updateQuote({
        project_title: draft.project_title,
        summary: draft.summary,
        line_items: draft.line_items.map((item) => ({ ...item, id: recordId("item") })),
        payment_plan: draft.payment_plan,
        deposit_percent: draft.deposit_percent,
        payment_links: [],
        contract_template_id: template.id,
        document_depth: draft.document_depth,
        contract_sections: exactTemplate
          ? structuredClone(exactTemplate.sections)
          : sectionsForDepth(draft.document_depth, draft.service_type),
      });
      setResult(draft);
      setError("");
    } catch (nextError) {
      setResult(null);
      setError(nextError.message);
    }
  }

  return (
    <section className="brief-assistant">
      <div className="brief-assistant-heading">
        <span><Sparkles size={18} /></span>
        <div>
          <h2>Turn a project brief into a quote</h2>
          <p>Paste a client message or describe what you are building. The assistant uses your saved price book and agreement library.</p>
        </div>
        <small>Private · no AI credits</small>
      </div>
      <div className="brief-assistant-input">
        <textarea
          aria-label="Project brief"
          maxLength={8000}
          rows={5}
          value={brief}
          placeholder="Example: Build a premium six-page website with custom animations, a booking flow, CMS, analytics, and launch support…"
          onChange={(event) => {
            setBrief(event.target.value);
            setError("");
          }}
        />
        <div>
          <span>{brief.length.toLocaleString()} / 8,000</span>
          <button className="button primary" type="button" disabled={pricingLocked} onClick={populateQuote}>
            <Sparkles size={16} />Populate quote
          </button>
        </div>
      </div>
      {error && <p className="brief-assistant-error" role="alert"><X size={14} />{error}</p>}
      {result && (
        <div className="brief-assistant-result" role="status">
          <Check size={16} />
          <div>
            <strong>{result.structure_name} · {currency(result.line_items.reduce((sum, item) => sum + item.rate, 0))} starting quote</strong>
            <span>{result.recommendation} Review the scope and pricing before sending.</span>
            {result.detected_features.length > 0 && (
              <div>{result.detected_features.map((feature) => <i key={feature}>{feature}</i>)}</div>
            )}
          </div>
          <small>{result.pricing_source}</small>
        </div>
      )}
    </section>
  );
}

function QuoteEditor({
  workspace,
  quoteId,
  onSelectQuote,
  updateWorkspace,
  onCreatePaymentLink,
  onDeactivatePaymentLinks,
  previewMode,
}) {
  const quote = workspace.quotes.find((item) => item.id === quoteId);
  const client = workspace.clients.find((item) => item.id === quote?.client_id);
  if (!quote || !client) return null;
  const pricingLocked = (quote.payment_links || []).length > 0;

  function updateQuote(patch) {
    if (pricingLocked && ["line_items", "project_title", "payment_plan", "deposit_percent"]
      .some((field) => Object.prototype.hasOwnProperty.call(patch, field))) return;
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
  function selectClient(clientId) {
    const selectedClient = workspace.clients.find((item) => item.id === clientId);
    if (!selectedClient) return;
    updateWorkspace((current) => assignClientToQuote(current, quote.id, selectedClient));
  }
  function addClient() {
    const newClient = createClient();
    updateWorkspace((current) => assignClientToQuote(current, quote.id, newClient));
  }

  const total = quoteTotal(quote);
  const schedule = paymentScheduleForQuote(quote);

  return (
    <div className="quote-workspace">
      <RecentQuoteRail workspace={workspace} selectedId={quote.id} onSelect={onSelectQuote} />
      <main className="quote-document">
        <QuoteBriefAssistant workspace={workspace} quote={quote} updateQuote={updateQuote} pricingLocked={pricingLocked} />
        <section className="document-section client-details-section">
          <div className="document-section-heading client-section-heading">
            <div>
              <h2>Client & contact details</h2>
              <p>Create or choose a client here. These details populate the quote and agreement.</p>
            </div>
            <span>{quote.quote_number}</span>
          </div>
          <div className="client-picker">
            <label className="select-field">
              Client record
              <select value={client.id} onChange={(event) => selectClient(event.target.value)}>
                {workspace.clients.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.company || item.contact_name || item.email || "Unnamed client"}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <button type="button" className="button compact" onClick={addClient}>
              <Plus size={15} />New client
            </button>
          </div>
          <div className="client-grid">
            <Field label="Company" value={client.company} onChange={(value) => updateClient({ company: value })} />
            <Field label="Full name" value={client.contact_name} onChange={(value) => updateClient({ contact_name: value })} />
            <Field label="Email" type="email" value={client.email} help={client.email && !validEmail(client.email) ? "Enter a complete email before sending a quote." : ""} onChange={(value) => updateClient({ email: value })} />
            <Field label="Phone" value={client.phone} onChange={(value) => updateClient({ phone: value })} />
            <Field label="Website" type="url" value={client.website} onChange={(value) => updateClient({ website: value })} />
            <Field label="Billing address" multiline value={client.billing_address} onChange={(value) => updateClient({ billing_address: value })} />
          </div>
          <p className="client-security-note"><ShieldCheck size={13} />Stored in the protected client record. Do not enter passwords, Social Security numbers, bank details, or card numbers.</p>
        </section>
        <section className="document-section">
          <div className="document-section-heading">
            <h2>Project</h2>
            <div className="project-dates">
              <label className="date-inline"><span>Valid until</span><input type="date" value={quote.valid_until} onChange={(event) => updateQuote({ valid_until: event.target.value })} /></label>
              {quote.status === "sent" && <label className="date-inline"><span>Follow up</span><input type="date" value={quote.follow_up_due || ""} onChange={(event) => updateQuote({ follow_up_due: event.target.value })} /></label>}
            </div>
          </div>
          <div className="project-status-row">
            <label className="select-field">Quote status
              <select aria-label="Quote status" value={quote.status} disabled={pricingLocked} onChange={(event) => updateQuote({ status: event.target.value })}>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="approved">Approved</option>
                <option value="declined">Declined</option>
                <option value="archived">Archived</option>
              </select>
              <ChevronDown size={14} />
            </label>
            {quote.last_contacted_at && <p><Mail size={14} />Last emailed {formatDate(quote.last_contacted_at.slice(0, 10))}{quote.follow_up_count ? ` · ${quote.follow_up_count} follow-up${quote.follow_up_count === 1 ? "" : "s"}` : ""}</p>}
          </div>
          <Field label="Project title" value={quote.project_title} disabled={pricingLocked} onChange={(value) => updateQuote({ project_title: value })} />
          <Field label="Project summary" multiline value={quote.summary} onChange={(value) => updateQuote({ summary: value })} />
        </section>
        <LineItems quote={quote} updateQuote={updateQuote} pricingLocked={pricingLocked} />
        <PaymentPlanEditor
          quote={quote}
          updateQuote={updateQuote}
          onCreatePaymentLink={onCreatePaymentLink}
          onDeactivatePaymentLinks={onDeactivatePaymentLinks}
          previewMode={previewMode}
        />
        <section className="document-section totals-section">
          <Field label="Notes" multiline value={quote.notes} onChange={(value) => updateQuote({ notes: value })} />
          <div className="totals">
            <div><span>Subtotal</span><strong>{currency(total)}</strong></div>
            <div><span>{paymentPlanLabel(quote.payment_plan)}</span><strong>{schedule.length} payment{schedule.length === 1 ? "" : "s"}</strong></div>
            <div className="balance"><span>Due on approval</span><strong>{currency(schedule[0]?.amount || 0)}</strong></div>
          </div>
        </section>
      </main>
      <ContractInspector quote={quote} templates={workspace.templates} updateQuote={updateQuote} />
    </div>
  );
}

function QuotePreview({ quote, client, onClose, onSend, previewMode }) {
  const total = quoteTotal(quote);
  const schedule = paymentScheduleForQuote(quote);
  const [deliveryKind] = useState(quote.status === "sent" ? "follow_up" : "initial");
  const recipientValid = validEmail(client.email);
  const deliveryLabel = deliveryKind === "follow_up" ? "Send follow-up" : "Email quote";
  const [emailPanelOpen, setEmailPanelOpen] = useState(false);
  const [emailNote, setEmailNote] = useState(deliveryKind === "follow_up"
    ? `Just following up on the quote for ${quote.project_title || "your project"}. Please let me know if you have any questions or would like to adjust the scope.`
    : `Here is the quote we discussed for ${quote.project_title || "your project"}. Please reply directly with any questions or requested changes.`);
  const [emailState, setEmailState] = useState({
    busy: false,
    message: "",
    error: false,
    delivered: false,
  });
  const idempotencyKey = useRef(`quote-${deliveryKind}/${quote.id}/${crypto.randomUUID()}`);
  const documentLabel = quote.document_depth === "essential"
    ? "ESTIMATE"
    : quote.document_depth === "comprehensive"
      ? "DETAILED PROPOSAL & AGREEMENT"
      : "PROPOSAL & AGREEMENT";

  async function submitEmail(event) {
    event.preventDefault();
    setEmailState({ busy: true, message: "", error: false, delivered: false });
    try {
      const result = await onSend(quote.id, emailNote, idempotencyKey.current, deliveryKind);
      setEmailState({ busy: false, message: result.message, error: false, delivered: true });
    } catch (error) {
      setEmailState({ busy: false, message: error.message, error: true, delivered: false });
    }
  }

  return (
    <div className={`preview-overlay ${emailPanelOpen ? "sending" : ""}`} role="dialog" aria-modal="true" aria-labelledby="preview-title">
      <div className="preview-toolbar">
        <div><strong id="preview-title">Quote preview</strong><span>Review the document, then download the fillable PDF or email it to the client.</span></div>
        <div>
          <button className="button" onClick={onClose}><X size={16} />Close</button>
          {previewMode ? (
            <button className="button" onClick={() => window.print()}><Printer size={17} />Print preview</button>
          ) : (
            <a
              className="button"
              href={`/api/admin-quote-pdf?quote_id=${encodeURIComponent(quote.id)}`}
              download
            >
              <Download size={17} />Download fillable PDF
            </a>
          )}
          <button className="button primary" onClick={() => setEmailPanelOpen(true)} disabled={!recipientValid}><Mail size={17} />{deliveryLabel}</button>
        </div>
      </div>
      {emailPanelOpen && (
        <div className="send-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEmailPanelOpen(false)}>
          <form className="send-dialog" onSubmit={submitEmail}>
            <div className="send-dialog-heading">
              <div className="send-dialog-icon"><Send size={19} /></div>
              <div><h2>{deliveryKind === "follow_up" ? "Follow up on this quote" : "Send this quote"}</h2><p>Resend will deliver the saved quote and agreement with a fillable electronic-signature PDF attached.</p></div>
              <button type="button" className="icon-button" onClick={() => setEmailPanelOpen(false)} aria-label="Close email panel"><X size={17} /></button>
            </div>
            <dl>
              <div><dt>From</dt><dd>Evan at 1stStep.ai &lt;evan@1ststep.ai&gt;</dd></div>
              <div><dt>To</dt><dd>{client.contact_name || client.company} &lt;{client.email || "Add a client email first"}&gt;</dd></div>
              <div><dt>Subject</dt><dd>{deliveryKind === "follow_up" ? "Follow-up: " : ""}Quote {quote.quote_number}: {quote.project_title || "Project quote"} from 1stStep.ai</dd></div>
            </dl>
            <label>
              <span>Personal note</span>
              <textarea rows={6} maxLength={1600} value={emailNote} onChange={(event) => setEmailNote(event.target.value)} />
            </label>
            {emailState.message && <p className={emailState.error ? "send-feedback error" : "send-feedback success"} role="status">
              {emailState.error ? <X size={15} /> : <Check size={15} />}{emailState.message}
            </p>}
            {previewMode && <p className="send-preview-note"><Eye size={14} />Local preview mode will simulate delivery and will not send an email.</p>}
            {!recipientValid && <p className="send-feedback error"><X size={15} />Add a valid client email before sending.</p>}
            <div className="send-dialog-actions">
              <button type="button" className="button" onClick={() => setEmailPanelOpen(false)}>Cancel</button>
              <button type="submit" className="button primary" disabled={emailState.busy || emailState.delivered || !recipientValid}>
                <Send size={16} />{emailState.busy ? "Sending…" : emailState.delivered ? "Sent" : `${deliveryLabel} to ${client.email || "client"}`}
              </button>
            </div>
          </form>
        </div>
      )}
      <article className="quote-preview">
        <header className="print-header">
          <Logo />
          <div><strong>{documentLabel}</strong><span>{quote.quote_number}</span></div>
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
          <div><span>Payment plan</span><strong>{paymentPlanLabel(quote.payment_plan)}</strong></div>
          {schedule.map((installment) => {
            const paymentLink = (quote.payment_links || []).find(
              (link) => Number(link.installment_number) === installment.installment_number
            );
            return (
              <div key={installment.installment_number}>
                <span>{installment.label} · {installment.due}</span>
                <strong>{currency(installment.amount)}</strong>
                {paymentLink && <a href={paymentLink.url}>Pay securely by card</a>}
              </div>
            );
          })}
        </section>
        <p className="print-payment-note">Preferred payment method: credit or debit card through secure Stripe checkout. Eligible wallets and financing options may also appear.</p>
        {quote.notes && <section className="print-notes"><h2>Notes</h2><p>{quote.notes}</p></section>}
        <section className="print-contract">
          <h1>Agreement terms</h1>
          {quote.contract_sections.filter((section) => section.enabled).map((section, index) => (
            <div key={section.id}><h2>{index + 1}. {section.title}</h2><p>{section.body}</p></div>
          ))}
        </section>
        <section className="print-esign-note">
          <h2>Electronic acceptance</h2>
          <p>The attached fillable PDF includes fields for the client’s full legal name, title, typed signature, date, and acceptance confirmation. Save and return the completed PDF to evan@1ststep.ai.</p>
        </section>
        <section className="signature-grid">
          <div><span>Client electronic signature</span><i /><small>Full legal name and date signed</small></div>
          <div><span>1stStep.ai</span><i /><small>Authorized signature and date</small></div>
        </section>
      </article>
    </div>
  );
}

function StudioApp({ previewMode = false }) {
  const [workspace, setWorkspace] = useState(previewMode ? previewWorkspace() : EMPTY_WORKSPACE);
  const [workspaceLoading, setWorkspaceLoading] = useState(!previewMode);
  const [page, setPage] = useState(commandViewFromPath() ? "command-center" : previewMode ? "quote-editor" : "overview");
  const [commandView, setCommandView] = useState(commandViewFromPath() || "agents");
  const [selectedQuoteId, setSelectedQuoteId] = useState(previewMode ? workspace.quotes[0]?.id : null);
  const [previewQuoteId, setPreviewQuoteId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const changeVersion = useRef(0);

  useEffect(() => {
    if (previewMode) return;
    api("/api/admin-workspace")
      .then((data) => setWorkspace(data.workspace))
      .catch((error) => setMessage(error.message))
      .finally(() => setWorkspaceLoading(false));
  }, [previewMode]);

  useEffect(() => {
    function restorePath() {
      const command = commandViewFromPath();
      setCommandView(command || "agents");
      setPage(command ? "command-center" : "overview");
    }
    window.addEventListener("popstate", restorePath);
    return () => window.removeEventListener("popstate", restorePath);
  }, []);

  function navigatePage(nextPage) {
    const path = (nextPage === "command-center" ? `/admin/${commandView}` : "/admin/") + (previewMode ? "?preview=1" : "");
    if (`${window.location.pathname}${window.location.search}` !== path) window.history.pushState({}, "", path);
    setPage(nextPage);
  }

  function navigateCommandView(nextView) {
    if (!COMMAND_VIEWS.some(([id]) => id === nextView)) return;
    window.history.pushState({}, "", `/admin/${nextView}${previewMode ? "?preview=1" : ""}`);
    setCommandView(nextView);
    setPage("command-center");
  }

  useEffect(() => {
    if (!dirty) return undefined;
    function warnBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  function updateWorkspace(updater) {
    setWorkspace((current) => updater(current));
    changeVersion.current += 1;
    setDirty(true);
    setMessage("");
  }

  function newQuote(pricingStructure = null) {
    const structure = pricingStructure?.starting_price !== undefined ? pricingStructure : null;
    const preferredTemplateId = structure?.category === "app" ? "ios-app-build" : "website-build";
    const template = workspace.templates.find((item) => item.id === preferredTemplateId)
      || workspace.templates[0]
      || DEFAULT_TEMPLATES[0];
    const client = createClient();
    const quote = createQuote(client, template, workspace.quotes.length + 1, structure ? {
      project_title: structure.name,
      summary: structure.summary,
      line_items: [{
        id: recordId("item"),
        name: structure.name,
        description: structure.inclusions.split("\n").filter(Boolean).join(" · ").slice(0, 500),
        quantity: 1,
        rate: structure.starting_price,
      }],
      deposit_percent: structure.billing_type === "monthly"
        ? 100
        : workspace.pricing_settings?.default_deposit_percent ?? 40,
      payment_plan: structure.billing_type === "monthly" ? "full" : "three_payments",
      card_payments_enabled: true,
      payment_links: [],
      notes: structure.billing_type === "monthly"
        ? "Monthly service billed in advance. Final scope, response times, and third-party costs are confirmed before work begins."
        : "Quote valid for 30 days. Final scope and third-party costs are confirmed before work begins.",
    } : {});
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
    const savingVersion = changeVersion.current;
    const savingWorkspace = workspace;
    setSaving(true);
    setMessage("");
    if (previewMode) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setDirty(false);
      setMessage("Preview changes saved for this session.");
      setSaving(false);
      return true;
    }
    try {
      const data = await api("/api/admin-workspace", {
        method: "PUT",
        body: JSON.stringify({
          expected_revision: savingWorkspace.revision,
          workspace: savingWorkspace,
        }),
      });
      if (changeVersion.current === savingVersion) {
        setWorkspace(data.workspace);
        setDirty(false);
        setMessage("Workspace saved.");
        return true;
      }
      setWorkspace((current) => ({
        ...current,
        revision: data.workspace.revision,
        updated_at: data.workspace.updated_at,
      }));
      setMessage("Newer edits appeared while saving. Save once more before previewing.");
      return false;
    } catch (error) {
      setMessage(error.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function openPreview(quoteId) {
    if (saving) return;
    if (dirty && !(await save())) return;
    setPreviewQuoteId(quoteId);
  }

  async function sendQuote(quoteId, note, idempotencyKey, deliveryKind) {
    if (dirty) {
      throw new Error("Save the latest quote changes before sending.");
    }
    if (previewMode) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      const sentAt = new Date().toISOString();
      setWorkspace((current) => recordQuoteDelivery(current, quoteId, {
        deliveryId: `preview_${crypto.randomUUID()}`,
        sentAt,
        deliveryKind,
      }));
      return {
        message: deliveryKind === "follow_up"
          ? "Preview follow-up simulated. No email was sent."
          : "Preview delivery simulated. No email was sent.",
      };
    }
    const data = await api("/api/admin-send-quote", {
      method: "POST",
      body: JSON.stringify({
        quote_id: quoteId,
        note,
        idempotency_key: idempotencyKey,
        delivery_kind: deliveryKind,
      }),
    });
    if (data.workspace) {
      setWorkspace(data.workspace);
      setDirty(false);
    }
    return {
      message: data.status_saved
        ? deliveryKind === "follow_up"
          ? "Follow-up sent from evan@1ststep.ai and the next follow-up date was scheduled."
          : "Quote sent from evan@1ststep.ai and marked as sent."
        : data.message || "Quote sent from evan@1ststep.ai.",
    };
  }

  async function createPaymentLink(quoteId, installmentNumber, idempotencyKey) {
    if (previewMode) {
      throw new Error("Open the protected production admin to create a real Stripe link.");
    }
    if (dirty) {
      throw new Error("Save the latest quote changes before creating a card link.");
    }
    const data = await api("/api/admin-create-payment-link", {
      method: "POST",
      body: JSON.stringify({
        quote_id: quoteId,
        installment_number: installmentNumber,
        idempotency_key: idempotencyKey,
      }),
    });
    setWorkspace(data.workspace);
    setDirty(false);
    setMessage("Secure card link created.");
    return data.payment_link;
  }

  async function deactivatePaymentLinks(quoteId) {
    if (dirty) {
      throw new Error("Save or discard the latest changes before deactivating card links.");
    }
    if (previewMode) {
      setWorkspace((current) => ({
        ...current,
        quotes: current.quotes.map((quote) => quote.id === quoteId
          ? { ...quote, payment_links: [] }
          : quote),
      }));
      return { deactivated: 0 };
    }
    const data = await api("/api/admin-deactivate-payment-links", {
      method: "POST",
      body: JSON.stringify({ quote_id: quoteId }),
    });
    setWorkspace(data.workspace);
    setDirty(false);
    setMessage("Old card links deactivated. Pricing is unlocked.");
    return data;
  }

  async function logout() {
    if (!previewMode) await api("/api/admin-session", { method: "DELETE", body: "{}" }).catch(() => {});
    window.location.reload();
  }

  if (workspaceLoading) {
    return <div className="loading-screen"><Logo /><span>Loading protected client records…</span></div>;
  }

  const selectedQuote = workspace.quotes.find((quote) => quote.id === selectedQuoteId);
  const previewQuote = workspace.quotes.find((quote) => quote.id === previewQuoteId);
  const previewClient = workspace.clients.find((client) => client.id === previewQuote?.client_id);
  const pageTitle = page === "quote-editor" ? (selectedQuote?.project_title || "New quote") : page === "command-center" ? COMMAND_VIEWS.find(([id]) => id === commandView)?.[1] || "Command Center" : NAVIGATION.find((item) => item.id === page)?.label || "1stStep Studio";

  let pageContent;
  if (page === "overview") pageContent = <Overview workspace={workspace} onEditQuote={editQuote} onNewQuote={newQuote} />;
  if (page === "command-center") pageContent = <CommandCenter api={api} previewMode={previewMode} view={commandView} onViewChange={navigateCommandView} />;
  if (page === "job-agent") pageContent = <JobAgentOperationsPage previewMode={previewMode} />;
  if (page === "journey-requests") pageContent = <JourneyRequestsPage previewMode={previewMode} />;
  if (page === "clients") pageContent = <ClientsPage workspace={workspace} updateWorkspace={updateWorkspace} />;
  if (page === "quotes") pageContent = <QuotesPage workspace={workspace} onEditQuote={editQuote} onNewQuote={newQuote} />;
  if (page === "pricing") pageContent = <PricingPage workspace={workspace} updateWorkspace={updateWorkspace} onStartQuote={newQuote} />;
  if (page === "contracts") pageContent = <ContractsPage workspace={workspace} updateWorkspace={updateWorkspace} />;
  if (page === "settings") pageContent = <SettingsPage workspace={workspace} previewMode={previewMode} />;
  if (page === "quote-editor") pageContent = selectedQuote
    ? <QuoteEditor
        workspace={workspace}
        quoteId={selectedQuote.id}
        onSelectQuote={setSelectedQuoteId}
        updateWorkspace={updateWorkspace}
        onCreatePaymentLink={createPaymentLink}
        onDeactivatePaymentLinks={deactivatePaymentLinks}
        previewMode={previewMode}
      />
    : <EmptyState icon={FileText} title="Quote not found" body="Return to Quotes and choose another document." />;

  const editorActions = page === "quote-editor" && selectedQuote;
  return (
    <div className="studio-shell">
      <Sidebar page={page === "quote-editor" ? "quotes" : page} setPage={navigatePage} onLogout={logout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="studio-main">
        <Topbar
          title={pageTitle}
          status={editorActions ? selectedQuote.status : null}
          onMenu={() => setMobileOpen(true)}
          actions={(
            <>
              {message && <span className="save-message" role="status">{message}</span>}
              {page === "quote-editor" && <button className="button ghost" onClick={() => setPage("quotes")}><ArrowLeft size={16} />All quotes</button>}
              {page !== "job-agent" && page !== "journey-requests" && page !== "command-center" && <button className="button" onClick={save} disabled={saving || (!dirty && !previewMode)}><Save size={16} />{saving ? "Saving…" : dirty ? "Save draft" : "Saved"}</button>}
              {editorActions && <button className="button primary" disabled={saving} onClick={() => openPreview(selectedQuote.id)}><Eye size={17} />{dirty ? "Save, preview & send" : "Preview & send"}</button>}
            </>
          )}
        />
        {previewMode && page !== "command-center" && <div className="preview-banner"><Eye size={15} />Local design preview. Sample records stay in this browser session and are never uploaded.</div>}
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
  const [mfaRequired, setMfaRequired] = useState(import.meta.env.PROD);
  const [mobileTotpLoginAllowed, setMobileTotpLoginAllowed] = useState(false);

  async function checkSession() {
    setLoading(true);
    try {
      const data = await api("/api/admin-session");
      setAuthenticated(data.authenticated);
      if (typeof data.mfa_required === "boolean") {
        setMfaRequired(data.mfa_required);
      }
      setMobileTotpLoginAllowed(Boolean(data.mobile_totp_login_allowed));
    } catch {
      setAuthenticated(false);
      setMobileTotpLoginAllowed(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (!previewMode) checkSession(); }, [previewMode]);
  useEffect(() => {
    if (previewMode) return undefined;
    const handleSessionExpired = () => {
      setAuthenticated(false);
      setMobileTotpLoginAllowed(false);
    };
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [previewMode]);
  if (loading) return <div className="loading-screen"><Logo /><span>Opening your studio…</span></div>;
  return authenticated
    ? <StudioApp previewMode={previewMode} />
    : <Login onAuthenticated={checkSession} mfaRequired={mfaRequired} mobileTotpLoginAllowed={mobileTotpLoginAllowed} />;
}

const studioRoot = window.__firststepStudioRoot || createRoot(document.getElementById("root"));
window.__firststepStudioRoot = studioRoot;
studioRoot.render(<Root />);
