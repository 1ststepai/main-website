import { inject, track } from "@vercel/analytics";

const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
];
const FIRST_TOUCH_KEY = "fsai:first-touch:v1";
const LAST_TOUCH_KEY = "fsai:last-touch:v1";
const MAX_VALUE_LENGTH = 180;

function cleanValue(value) {
  return String(value || "").trim().slice(0, MAX_VALUE_LENGTH);
}

function readStored(key) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function store(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Attribution still works for the current page when storage is unavailable.
  }
}

export function attributionFromUrl(url = window.location.href) {
  const parsed = new URL(url, window.location.origin);
  return ATTRIBUTION_KEYS.reduce((result, key) => {
    const value = cleanValue(parsed.searchParams.get(key));
    if (value) result[key] = value;
    return result;
  }, {});
}

function captureAttribution() {
  const current = attributionFromUrl();
  if (!Object.keys(current).length) return;

  const touch = {
    ...current,
    captured_at: new Date().toISOString(),
    landing_path: window.location.pathname,
  };

  if (!Object.keys(readStored(FIRST_TOUCH_KEY)).length) {
    store(FIRST_TOUCH_KEY, touch);
  }
  store(LAST_TOUCH_KEY, touch);
}

export function getAttribution() {
  const current = attributionFromUrl();
  const last = readStored(LAST_TOUCH_KEY);
  const first = readStored(FIRST_TOUCH_KEY);
  const selected = Object.keys(current).length ? current : last;

  return {
    ...ATTRIBUTION_KEYS.reduce((result, key) => {
      const value = cleanValue(selected[key]);
      if (value) result[key] = value;
      return result;
    }, {}),
    first_touch_source: cleanValue(first.utm_source),
    first_touch_campaign: cleanValue(first.utm_campaign),
    landing_path: cleanValue(first.landing_path || window.location.pathname),
  };
}

export function appendAttribution(rawUrl) {
  const url = new URL(rawUrl, window.location.origin);
  const attribution = getAttribution();

  ATTRIBUTION_KEYS.forEach((key) => {
    if (attribution[key] && !url.searchParams.has(key)) {
      url.searchParams.set(key, attribution[key]);
    }
  });

  return url.toString();
}

function analyticsContext(extra = {}) {
  const attribution = getAttribution();
  const source = cleanValue(attribution.utm_source || "direct");
  const campaign = cleanValue(attribution.utm_campaign || "unattributed");
  const detail = Object.entries(extra)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .map(([key, value]) => `${key}:${cleanValue(value)}`)
    .join("|")
    .slice(0, 255);

  return {
    attribution: `${source}/${campaign}`.slice(0, 255),
    detail: detail || `path:${window.location.pathname.slice(0, 200)}`,
  };
}

export function trackSiteEvent(name, properties = {}) {
  try {
    track(name, analyticsContext(properties));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[1stStep.ai analytics]", error);
    }
  }
}

function decorateAttributionLinks() {
  document.querySelectorAll("a[href]").forEach((link) => {
    let url;
    try {
      url = new URL(link.href, window.location.origin);
    } catch {
      return;
    }

    if (
      url.origin === window.location.origin &&
      (url.pathname === "/book/" || url.pathname === "/fit-check/")
    ) {
      link.href = appendAttribution(url);
    }
  });
}

function handleTrackedClick(event) {
  const link = event.target.closest("a[href]");
  if (!link) return;

  const explicitEvent = link.dataset.fsaiEvent;
  if (explicitEvent) {
    trackSiteEvent(explicitEvent, {
      placement: cleanValue(link.dataset.fsaiPlacement || "unspecified"),
    });
    return;
  }

  let url;
  try {
    url = new URL(link.href, window.location.origin);
  } catch {
    return;
  }

  if (url.origin === window.location.origin && url.pathname === "/book/") {
    trackSiteEvent("website_strategy_call_click", {
      placement: cleanValue(link.dataset.fsaiPlacement || "site"),
    });
  } else if (url.origin === window.location.origin && url.pathname === "/fit-check/") {
    trackSiteEvent("fit_check_click", {
      placement: cleanValue(link.dataset.fsaiPlacement || "site"),
    });
  } else if (link.dataset.fsaiCaseStudy) {
    trackSiteEvent("case_study_click", {
      case_study: cleanValue(link.dataset.fsaiCaseStudy),
    });
  }
}

captureAttribution();
inject();
decorateAttributionLinks();
document.addEventListener("click", handleTrackedClick);

window.fsaiAttribution = {
  appendToUrl: appendAttribution,
  get: getAttribution,
};
window.fsaiTrack = trackSiteEvent;

const pageEvent = document.body.dataset.fsaiPageEvent;
if (pageEvent) {
  trackSiteEvent(pageEvent, {
    audience: cleanValue(document.body.dataset.fsaiAudience || "general"),
  });
}
