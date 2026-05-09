import React from "react";
import { createRoot } from "react-dom/client";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  DatabaseZap,
  Gauge,
  MessageSquareText,
  PhoneCall,
  Play,
  ShieldCheck,
  Star,
  Wrench,
  Zap,
} from "lucide-react";
import "./styles.css";
import logo from "../1ststep-ai-logo-official.png";

const BOOKING_URL = "https://api.leadconnectorhq.com/widget/booking/Rb4aqLM1NdU5kvZcqNmj";

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 },
};

function App() {
  return (
    <main className="min-h-screen overflow-hidden bg-blacktop text-white">
      <IndustrialBackdrop />
      <Header />
      <Hero />
      <BuildTypes />
      <StrategySection />
      <ReadinessSection />
      <Pillars />
      <BuildPath />
      <ProductsSection />
      <Contact />
      <Footer />
    </main>
  );
}

function IndustrialBackdrop() {
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-blacktop" />
      <div className="absolute inset-0 bg-grid bg-[length:42px_42px] opacity-70" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,163,255,0.16),transparent_36%),linear-gradient(180deg,rgba(5,5,5,0),#050505_82%)]" />
      <div className="absolute left-0 top-0 h-full w-px bg-blue/40" />
      <div className="absolute right-0 top-0 h-full w-px bg-go/20" />
    </div>
  );
}

function Header() {
  return (
    <header className="relative z-20 border-b border-line bg-blacktop/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <a href="#top" className="flex items-center gap-3">
          <img src={logo} alt="1stStep.ai" className="h-9 w-9 rounded-sm object-cover" />
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-steel">1stStep.ai</p>
            <p className="text-sm font-semibold text-white">Strategic Build Studio</p>
          </div>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-steel md:flex">
          <a className="hover:text-white" href="/app-idea-viability-checker.html">Idea Checker</a>
          <a className="hover:text-white" href="#system">Builds</a>
          <a className="hover:text-white" href="#contact">Strategy Call</a>
        </nav>
        <a href={BOOKING_URL} target="_blank" rel="noreferrer" className="btn btn-small btn-primary">
          <ClipboardCheck className="h-4 w-4" />
          Book Strategy Call
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pb-24 lg:pt-16">
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.04fr_0.96fr]">
        <motion.div
          initial="hidden"
          animate="visible"
          transition={{ staggerChildren: 0.08 }}
          className="max-w-3xl"
        >
          <motion.div variants={fadeUp} className="status-chip mb-6">
            <span className="h-2 w-2 bg-go shadow-green" />
            Apps, websites, MVPs, automations, and digital products
          </motion.div>
          <motion.h1 variants={fadeUp} className="text-balance text-5xl font-semibold leading-[0.96] sm:text-6xl lg:text-7xl">
            Build the right first version before you spend on the wrong one.
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-6 max-w-2xl text-lg leading-8 text-steel sm:text-xl">
            Apps, websites, MVPs, and automations built around the right first version.
            1stStep.ai helps founders, operators, and service businesses turn raw ideas into focused builds
            that prove demand before scope gets expensive.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="/app-idea-viability-checker.html" className="btn btn-primary">
              Check Your App Idea
              <ArrowRight className="h-5 w-5" />
            </a>
            <a href={BOOKING_URL} target="_blank" rel="noreferrer" className="btn btn-secondary">
              <Play className="h-5 w-5" />
              Book a Build Strategy Call
            </a>
          </motion.div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative"
        >
          <CommandPanel />
        </motion.div>
      </div>
    </section>
  );
}

function CommandPanel() {
  const rows = [
    ["App idea", "Scored for viability", "91/100"],
    ["First workflow", "Scoped for MVP", "Core"],
    ["Launch path", "Phased build plan", "Ready"],
    ["Overbuild risk", "Reduced before dev", "-42%"],
  ];

  return (
    <div className="glass-panel p-4 sm:p-5">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-blue">MVP Readiness Console</p>
          <h2 className="mt-1 text-xl font-semibold">Build Strategy Snapshot</h2>
        </div>
        <Gauge className="h-7 w-7 text-go" />
      </div>
      <div className="grid gap-3 py-5 sm:grid-cols-3">
        <Metric label="Demand" value="82" />
        <Metric label="Revenue" value="76" />
        <Metric label="Scope fit" value="88" />
      </div>
      <div className="space-y-3">
        {rows.map(([event, action, value]) => (
          <div key={event} className="data-row">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center border border-line bg-white/[0.04]">
                <Zap className="h-4 w-4 text-blue" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{event}</p>
                <p className="truncate text-xs text-steel">{action}</p>
              </div>
            </div>
            <p className="font-mono text-sm text-go">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 border border-blue/30 bg-blue/10 p-4">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-blue">Recommended first build</p>
        <p className="mt-2 text-2xl font-semibold">Focused MVP with one core workflow</p>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="border border-line bg-white/[0.035] p-4">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-steel">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function BuildTypes() {
  return (
    <section className="border-y border-line bg-white/[0.025] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-steel">Built for</p>
        <div className="grid grid-cols-2 gap-3 text-sm font-semibold text-white sm:flex sm:flex-wrap sm:gap-5">
          {["Mobile Apps", "Web Apps / SaaS", "Business Websites", "AI Automations", "MVP Builds"].map((name) => (
            <span key={name} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-go" />
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function StrategySection() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="glass-panel grid gap-8 p-6 sm:p-8 lg:grid-cols-[0.92fr_1.08fr] lg:p-10">
          <div>
            <p className="section-kicker">Strategic builder</p>
            <h2 className="section-title mt-3">Not every idea needs a full app first.</h2>
          </div>
          <div className="border-l-0 border-line lg:border-l lg:pl-8">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center border border-blue/40 bg-blue/10">
                <BriefcaseBusiness className="h-6 w-6 text-blue" />
              </div>
              <p className="text-lg leading-8 text-steel">
                Evan helps you decide what should actually be built first: a validation page, prototype,
                internal workflow, lean MVP, or phased product. The goal is momentum with evidence, not
                an expensive pile of features nobody asked for.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReadinessSection() {
  return (
    <section id="checker" className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="section-kicker">Free MVP Readiness Score</p>
          <h2 className="section-title mt-3">Not sure if your app is worth building?</h2>
          <p className="mt-5 max-w-xl text-lg leading-8 text-steel">
            Run the App Idea Viability Checker before you spend thousands building the wrong thing.
            You will get a practical score, risk readout, budget path, and recommended next step.
          </p>
          <a href="/app-idea-viability-checker.html" className="btn btn-primary mt-8">
            Check My Idea
            <ArrowRight className="h-5 w-5" />
          </a>
        </div>
        <div className="glass-panel p-5 sm:p-7">
          <div className="flex items-center gap-3 border-b border-line pb-5">
            <Calculator className="h-6 w-6 text-go" />
            <p className="font-mono text-sm uppercase tracking-[0.16em] text-steel">What the checker gives you</p>
          </div>
          <div className="grid gap-3 py-6">
            {[
              "Viability score out of 100",
              "Market demand, revenue, complexity, and distribution breakdown",
              "Recommended first version and budget path",
              "Context pack generated for scoping the MVP",
            ].map((item) => (
              <div className="data-row" key={item}>
                <span className="flex items-center gap-3 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-go" />
                  {item}
                </span>
              </div>
            ))}
          </div>
          <div className="border border-go/30 bg-go/10 p-5">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-go">Founder-friendly rule</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Prove the workflow before you fund the platform.</p>
            <p className="mt-3 text-sm leading-6 text-steel">
              The tool is not a guarantee. It is a practical first-pass assessment to avoid overbuilding.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pillars() {
  const pillars = [
    {
      icon: PhoneCall,
      title: "Apps and SaaS MVPs",
      copy: "Focused first versions with the core workflow, lead capture, auth, payments, dashboards, or admin tools only when they matter.",
      accent: "text-blue",
    },
    {
      icon: Star,
      title: "Conversion Websites",
      copy: "Service-business and product websites built to explain the offer, capture demand, and feed the sales pipeline.",
      accent: "text-go",
    },
    {
      icon: DatabaseZap,
      title: "Automation Systems",
      copy: "Internal workflows, CRM automations, lead routing, report generation, and manual-process replacement.",
      accent: "text-blue",
    },
    {
      icon: MessageSquareText,
      title: "AI Tools",
      copy: "Practical AI features wrapped in workflows people can use: intake, scoring, generation, routing, and decision support.",
      accent: "text-go",
    },
  ];

  return (
    <section id="system" className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 max-w-3xl">
          <p className="section-kicker">What we build</p>
          <h2 className="section-title mt-3">Digital products with a clear first move.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {pillars.map((pillar, index) => {
            const Icon = pillar.icon;
            return (
              <motion.article
                key={pillar.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.45, delay: index * 0.05 }}
                className={`bento-card ${index === 0 ? "md:min-h-[310px]" : ""}`}
              >
                <div className="flex items-start justify-between gap-5">
                  <div className="grid h-12 w-12 place-items-center border border-line bg-white/[0.045]">
                    <Icon className={`h-6 w-6 ${pillar.accent}`} />
                  </div>
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-steel">0{index + 1}</span>
                </div>
                <h3 className="mt-8 text-2xl font-semibold">{pillar.title}</h3>
                <p className="mt-4 max-w-xl text-base leading-7 text-steel">{pillar.copy}</p>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function BuildPath() {
  return (
    <section id="build-path" className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 border-y border-line py-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div>
          <p className="section-kicker">Build path</p>
          <h2 className="section-title mt-3">Start with the smallest version that can prove demand.</h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-steel">
            The right first release might be a landing page, clickable prototype, internal tool,
            workflow test, or focused MVP. The strategy call maps that path before development starts.
          </p>
        </div>
        <a href="/app-idea-viability-checker.html" className="video-link">
          <span className="grid h-14 w-14 place-items-center border border-blue/40 bg-blue/15">
            <Play className="h-7 w-7 fill-blue text-blue" />
          </span>
          <span>
            <span className="block text-lg font-semibold text-white">Run the MVP Readiness Score</span>
            <span className="mt-1 block text-sm text-steel">Then book the strategy call with better context.</span>
          </span>
        </a>
      </div>
    </section>
  );
}

function ProductsSection() {
  const items = [
    {
      title: "App Idea Viability Checker",
      copy: "A free MVP Readiness Score for app, website, SaaS, automation, and digital product ideas.",
      href: "/app-idea-viability-checker.html",
      label: "Run the checker",
    },
    {
      title: "AI Resume Builder",
      copy: "A separate job-search product by 1stStep.ai. It is not the main services website.",
      href: "https://resume.1ststep.ai/",
      label: "Visit resume product",
    },
  ];

  return (
    <section className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 max-w-3xl">
          <p className="section-kicker">Built by 1stStep.ai</p>
          <h2 className="section-title mt-3">Products and builds stay in their lanes.</h2>
          <p className="mt-5 text-lg leading-8 text-steel">
            1ststep.ai is the parent site for build strategy, apps, MVPs, websites, SaaS, and automations.
            The resume builder lives separately.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <a key={item.title} href={item.href} className="bento-card block" target={item.href.startsWith("http") ? "_blank" : undefined} rel={item.href.startsWith("http") ? "noreferrer" : undefined}>
              <h3 className="text-2xl font-semibold">{item.title}</h3>
              <p className="mt-4 text-base leading-7 text-steel">{item.copy}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-blue">
                {item.label}
                <ArrowRight className="h-4 w-4" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="px-4 pb-20 pt-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="section-kicker">Book the strategy call</p>
          <h2 className="section-title mt-3">Map the version worth building first.</h2>
          <div className="mt-8 grid gap-3 text-sm text-steel">
            {[
              ["No generic agency pitch", ShieldCheck],
              ["Scope, budget, and launch path before build", Wrench],
              ["Clear next step, even if the answer is not to build yet", BadgeCheck],
            ].map(([text, Icon]) => (
              <p key={text} className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-go" />
                {text}
              </p>
            ))}
          </div>
        </div>
        <form className="glass-panel p-5 sm:p-7" data-ghl-ready="true">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" placeholder="Your name" />
            <FormField label="Phone" placeholder="Best number" type="tel" />
            <FormField label="Project" placeholder="App, website, SaaS, automation..." />
            <FormField label="Email" placeholder="you@company.com" type="email" />
          </div>
          <label className="mt-5 block">
            <span className="form-label">What do you need first?</span>
            <select className="form-input mt-2" defaultValue="">
              <option value="" disabled>Select one</option>
              <option>Validate the idea</option>
              <option>Landing page / waitlist</option>
              <option>Clickable prototype</option>
              <option>MVP build</option>
              <option>Automation / internal tool</option>
            </select>
          </label>
          <label className="mt-5 block">
            <span className="form-label">What are you trying to build?</span>
            <textarea className="form-input mt-2 min-h-28 resize-y" placeholder="Tell me the idea, audience, budget range, and what would make this a win." />
          </label>
          <button type="submit" className="btn btn-primary mt-6 w-full justify-center">
            Request Build Strategy Call
            <ArrowRight className="h-5 w-5" />
          </button>
          <p className="mt-4 text-center text-xs leading-5 text-steel">
            For the fastest path, run the App Idea Viability Checker first and bring your score to the call.
          </p>
        </form>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line px-4 py-10 text-sm text-steel sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <p className="font-semibold text-white">1stStep.ai</p>
          <p className="mt-2 max-w-2xl leading-6">
            1ststep.ai is the main app, MVP, website, SaaS, automation, and build strategy services site.
            Resume products are separate: resume.1ststep.ai is the AI Resume Builder landing page,
            and app.1ststep.ai is the resume builder app.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 md:justify-end">
          <a className="hover:text-white" href="/app-idea-viability-checker.html">Idea Checker</a>
          <a className="hover:text-white" href={BOOKING_URL} target="_blank" rel="noreferrer">Book Call</a>
          <a className="hover:text-white" href="https://resume.1ststep.ai/" target="_blank" rel="noreferrer">AI Resume Builder</a>
        </div>
      </div>
    </footer>
  );
}

function FormField({ label, placeholder, type = "text" }) {
  return (
    <label className="block">
      <span className="form-label">{label}</span>
      <input className="form-input mt-2" type={type} placeholder={placeholder} />
    </label>
  );
}

createRoot(document.getElementById("root")).render(<App />);
