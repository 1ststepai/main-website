/** Official 1stStep.ai profiles. Sources: Evan (X, YouTube handle) and public/llms.txt. */
export const SOCIAL_PROFILES = [
  {
    name: "X",
    href: "https://x.com/1ststepai",
    label: "1stStep.ai on X (opens in a new tab)",
  },
  {
    name: "YouTube",
    href: "https://www.youtube.com/@1ststepdotai",
    label: "1stStep.ai on YouTube (opens in a new tab)",
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/company/1ststep-ai/",
    label: "1stStep.ai on LinkedIn (opens in a new tab)",
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/1ststepdotai/",
    label: "1stStep.ai on Instagram (opens in a new tab)",
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61566833623507",
    label: "1stStep.ai on Facebook (opens in a new tab)",
  },
  {
    name: "Google Business",
    href: "https://maps.app.goo.gl/x7XKauoXUwi2qfNdA",
    label: "1stStep.ai on Google Business Profile (opens in a new tab)",
  },
  {
    name: "GitHub",
    href: "https://github.com/1ststepai",
    label: "1stStep.ai on GitHub (opens in a new tab)",
  },
];

/** Channel URL already listed as the official YouTube profile in public/llms.txt. */
export const YOUTUBE_CHANNEL = "https://www.youtube.com/channel/UCynvog-XB0oFBigcrBvmxOg";

export const SAME_AS = [
  SOCIAL_PROFILES[0].href,
  SOCIAL_PROFILES[1].href,
  YOUTUBE_CHANNEL,
  ...SOCIAL_PROFILES.slice(2).map((profile) => profile.href),
];

export function socialNavHtml() {
  const links = SOCIAL_PROFILES.map(
    (profile) =>
      `<a href="${profile.href}" rel="me noopener" target="_blank" aria-label="${profile.label}">${profile.name}</a>`,
  ).join("");
  return `<nav class="social-nav" aria-label="1stStep.ai on social" data-fsai-social>${links}</nav>`;
}

/** Indexable public URLs. Book is omitted on the homepage because that page already links it. */
export const EXPLORE_LINKS = [
  { href: "/os", label: "1stStep OS" },
  { href: "/postpath/", label: "PostPath" },
  { href: "/work/", label: "Work" },
  { href: "/work/universal-relocations/", label: "Universal Relocations" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/journey/", label: "Begin Your Journey" },
  { href: "/fit-check/", label: "Project request" },
  { href: "/book/", label: "Book a call" },
  { href: "/tools/", label: "Tools" },
  { href: "/tools/auto-model-router/", label: "Auto Model Router" },
  { href: "/tools/1ststep-os-audit/", label: "OS Audit" },
  { href: "/tools/1ststep-os/", label: "OS Cycle 1" },
  { href: "/services/websites.html", label: "Websites" },
  { href: "/services/revenue-systems.html", label: "Lead automation" },
  { href: "/services/internal-tools.html", label: "Internal tools" },
  { href: "/services/mvp-builds.html", label: "MVP builds" },
  { href: "/services/app-builds.html", label: "iOS apps" },
  { href: "/services/gohighlevel-insurance-agencies.html", label: "GoHighLevel for insurance agencies" },
  { href: "/services/gohighlevel-real-estate-brokers.html", label: "GoHighLevel for real estate brokers" },
  { href: "/app-idea-viability-checker.html", label: "App Idea Checker" },
  { href: "/startup-launch-checker/", label: "Startup Launch Checker" },
  { href: "/campaigns/outgrown-website/", label: "Outgrown website" },
  { href: "/campaigns/morris-county-free-website/", label: "Morris County websites" },
  { href: "/privacy.html", label: "Privacy" },
  { href: "/terms.html", label: "Terms" },
];

export function exploreNavHtml({ includeBook = true } = {}) {
  const links = EXPLORE_LINKS.filter((link) => includeBook || link.href !== "/book/")
    .map((link) => `<a href="${link.href}">${link.label}</a>`)
    .join("");
  return `<nav class="explore-nav" aria-label="Explore" data-fsai-explore>${links}</nav>`;
}
