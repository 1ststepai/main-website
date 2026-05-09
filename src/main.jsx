import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
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

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

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
      <TrustedBy />
      <EngineerFlex />
      <ProfitLeakCalculator />
      <Pillars />
      <SetupVideo />
      <Contact />
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
            <p className="text-sm font-semibold text-white">Trade Systems Lab</p>
          </div>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-steel md:flex">
          <a className="hover:text-white" href="#calculator">Calculator</a>
          <a className="hover:text-white" href="#system">System</a>
          <a className="hover:text-white" href="#contact">Audit</a>
        </nav>
        <a href="#contact" className="btn btn-small btn-primary">
          <ClipboardCheck className="h-4 w-4" />
          System Audit
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
            Systems are GO for plumbers, electricians, and HVAC teams
          </motion.div>
          <motion.h1 variants={fadeUp} className="text-balance text-5xl font-semibold leading-[0.96] sm:text-6xl lg:text-7xl">
            Engineered Freedom for Trade Businesses.
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-6 max-w-2xl text-lg leading-8 text-steel sm:text-xl">
            We build the AI-powered systems that answer your phones, book your jobs, and chase your reviews.
            You handle the tools; we handle the office.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#contact" className="btn btn-primary">
              System Audit
              <ArrowRight className="h-5 w-5" />
            </a>
            <a href="#setup-video" className="btn btn-secondary">
              <Play className="h-5 w-5" />
              Watch the 1stStep in Action
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
    ["Missed call", "Text-back sent", "00:03"],
    ["Estimate request", "Booked", "02:14"],
    ["Completed job", "Review request queued", "Live"],
    ["Dormant lead", "Reactivation SMS", "$1,850"],
  ];

  return (
    <div className="glass-panel p-4 sm:p-5">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-blue">Lead-to-Invoice OS</p>
          <h2 className="mt-1 text-xl font-semibold">Office Automation Console</h2>
        </div>
        <Gauge className="h-7 w-7 text-go" />
      </div>
      <div className="grid gap-3 py-5 sm:grid-cols-3">
        <Metric label="Calls rescued" value="38" />
        <Metric label="Jobs booked" value="17" />
        <Metric label="Review asks" value="64" />
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
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-blue">Current leak detected</p>
        <p className="mt-2 text-2xl font-semibold">$127,400 recoverable pipeline</p>
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

function TrustedBy() {
  return (
    <section className="border-y border-line bg-white/[0.025] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-steel">Compatible with</p>
        <div className="grid grid-cols-2 gap-3 text-sm font-semibold text-white sm:flex sm:flex-wrap sm:gap-5">
          {["Housecall Pro", "ServiceTitan", "Jobber", "QuickBooks"].map((name) => (
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

function EngineerFlex() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="glass-panel grid gap-8 p-6 sm:p-8 lg:grid-cols-[0.92fr_1.08fr] lg:p-10">
          <div>
            <p className="section-kicker">Engineer's flex</p>
            <h2 className="section-title mt-3">Silicon Valley execution for the local trade.</h2>
          </div>
          <div className="border-l-0 border-line lg:border-l lg:pl-8">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center border border-blue/40 bg-blue/10">
                <BriefcaseBusiness className="h-6 w-6 text-blue" />
              </div>
              <p className="text-lg leading-8 text-steel">
                From the builders of <span className="font-semibold text-white">1stStep Resume AI</span>.
                We don't just use tools; we build them. We bring Silicon Valley engineering to the local trade.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfitLeakCalculator() {
  const [monthlyLeads, setMonthlyLeads] = useState(120);
  const [averageJobValue, setAverageJobValue] = useState(850);
  const [missedCallRate, setMissedCallRate] = useState(24);

  const annualLoss = useMemo(() => {
    return monthlyLeads * averageJobValue * (missedCallRate / 100) * 12;
  }, [monthlyLeads, averageJobValue, missedCallRate]);

  return (
    <section id="calculator" className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="section-kicker">Profit leak calculator</p>
          <h2 className="section-title mt-3">Every unanswered call has a price tag.</h2>
          <p className="mt-5 max-w-xl text-lg leading-8 text-steel">
            Trade owners don't lose money because they are bad at the work. They lose it in the gap between
            a ringing phone and a booked job.
          </p>
        </div>
        <div className="glass-panel p-5 sm:p-7">
          <div className="flex items-center gap-3 border-b border-line pb-5">
            <Calculator className="h-6 w-6 text-go" />
            <p className="font-mono text-sm uppercase tracking-[0.16em] text-steel">Annual revenue lost to poor follow-up</p>
          </div>
          <div className="grid gap-5 py-6">
            <RangeControl label="Monthly Leads" min={10} max={500} step={5} value={monthlyLeads} onChange={setMonthlyLeads} />
            <RangeControl label="Average Job Value" min={150} max={5000} step={50} value={averageJobValue} onChange={setAverageJobValue} prefix="$" />
            <RangeControl label="Missed Call Rate" min={1} max={70} step={1} value={missedCallRate} onChange={setMissedCallRate} suffix="%" />
          </div>
          <div className="border border-go/30 bg-go/10 p-5">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-go">Burn rate</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{money.format(annualLoss)}</p>
            <p className="mt-3 text-sm leading-6 text-steel">
              This is the rough annual revenue exposed when calls, quotes, and follow-ups slip through the cracks.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function RangeControl({ label, min, max, step, value, onChange, prefix = "", suffix = "" }) {
  return (
    <label className="block">
      <span className="mb-3 flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="font-mono text-sm text-blue">{prefix}{value.toLocaleString()}{suffix}</span>
      </span>
      <input
        className="w-full accent-blue"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Pillars() {
  const pillars = [
    {
      icon: PhoneCall,
      title: "24/7 AI Receptionist",
      copy: "Missed-call text-back, voice AI, and booking paths that keep hot leads from cooling off.",
      accent: "text-blue",
    },
    {
      icon: Star,
      title: "The Reputation Engine",
      copy: "Automated Google review requests after the job is done, while the customer still remembers the win.",
      accent: "text-go",
    },
    {
      icon: DatabaseZap,
      title: "Database Reactivation",
      copy: "Mine old leads, stale quotes, and past customers for fresh jobs without buying more ads.",
      accent: "text-blue",
    },
    {
      icon: MessageSquareText,
      title: "Unified Command",
      copy: "SMS, calls, GMB messages, follow-ups, and pipeline visibility in one operating system.",
      accent: "text-go",
    },
  ];

  return (
    <section id="system" className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 max-w-3xl">
          <p className="section-kicker">The 4-pillar system</p>
          <h2 className="section-title mt-3">A lead-to-invoice machine built around the phone.</h2>
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

function SetupVideo() {
  return (
    <section id="setup-video" className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 border-y border-line py-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div>
          <p className="section-kicker">Free 5-minute setup</p>
          <h2 className="section-title mt-3">See the first automation that stops the bleeding.</h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-steel">
            The fastest win is simple: when your team misses a call, the system answers with speed,
            context, and a booking path before the lead calls a competitor.
          </p>
        </div>
        <a href="#contact" className="video-link">
          <span className="grid h-14 w-14 place-items-center border border-blue/40 bg-blue/15">
            <Play className="h-7 w-7 fill-blue text-blue" />
          </span>
          <span>
            <span className="block text-lg font-semibold text-white">Watch the 1stStep in Action</span>
            <span className="mt-1 block text-sm text-steel">Then request the system audit.</span>
          </span>
        </a>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="px-4 pb-20 pt-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="section-kicker">Book the audit</p>
          <h2 className="section-title mt-3">Find the cash leak before another phone rings.</h2>
          <div className="mt-8 grid gap-3 text-sm text-steel">
            {[
              ["No generic CRM tour", ShieldCheck],
              ["Trade-specific call, quote, and job workflow map", Wrench],
              ["Clear next step, even if we are not the right fit", BadgeCheck],
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
            <FormField label="Company" placeholder="Trade business name" />
            <FormField label="Email" placeholder="you@company.com" type="email" />
          </div>
          <label className="mt-5 block">
            <span className="form-label">What's your biggest bottleneck?</span>
            <select className="form-input mt-2" defaultValue="">
              <option value="" disabled>Select one</option>
              <option>Missed calls</option>
              <option>No reviews</option>
              <option>No time</option>
              <option>Slow follow-up</option>
              <option>Old leads sitting idle</option>
            </select>
          </label>
          <label className="mt-5 block">
            <span className="form-label">What is breaking right now?</span>
            <textarea className="form-input mt-2 min-h-28 resize-y" placeholder="Calls, quotes, reviews, dispatch, follow-up..." />
          </label>
          <button type="submit" className="btn btn-primary mt-6 w-full justify-center">
            Request System Audit
            <ArrowRight className="h-5 w-5" />
          </button>
          <p className="mt-4 text-center text-xs leading-5 text-steel">
            GHL-ready form shell. Connect this form to your GoHighLevel workflow or embed script.
          </p>
        </form>
      </div>
    </section>
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
