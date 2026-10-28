const GLYPHS = {
  youtube: `<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 9.4v5.2l4.6-2.6z" fill="currentColor"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16.6" cy="7.4" r="0.9" fill="currentColor"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24"><path d="M14 8.5h2V6h-2c-2.2 0-3.5 1.4-3.5 3.6V11H8.5v2.5H10.5V20H13v-6.5h2.2l.4-2.5H13V9.7c0-.7.3-1.2 1-1.2z" fill="currentColor"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24"><path d="M14 6c.6 2.2 1.9 3.4 4 3.6v2.2c-1.4 0-2.7-.4-4-1.2v5.2c0 3-2.2 5-5 5s-4.2-2-4.2-4.4 1.8-4.2 4.2-4.2c.3 0 .7 0 1 .1v2.3c-.3-.1-.6-.2-1-.2-1.2 0-2 1-2 2.1s.9 2.1 2.1 2.1 2-.9 2-2.2V6H14z" fill="currentColor"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 10.5V16M8 8h.01M11.5 16v-3.2c0-1.2.8-2 1.9-2s1.8.7 1.8 2V16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  x: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  threads: `<svg viewBox="0 0 24 24"><path d="M9 8.5c1.4-1 3.2-1.4 5-.8 1.6.5 2.5 1.8 2.5 3.4 0 3.2-2.6 5.4-6.2 5.4-2.8 0-4.8-1.6-4.8-3.8S8 9.2 10.6 9.2c2 0 3.2 1 3.6 2.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12.2 11.6v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  pinterest: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 17.5l1.2-4.4M10.2 10.2c.4-1.6 2.8-2.2 3.8-.6.7 1.1.2 2.4-.8 3-1.1.6-2 .2-2.2-.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  bluesky: `<svg viewBox="0 0 24 24"><path d="M7 7.5c1.6 1.8 3.3 4.6 5 6.6 1.7-2 3.4-4.8 5-6.6 1.2 2.4.4 5.2-.8 6.8-.9 1.2-2.2 1.7-3.4 1.5 2.2.5 3.6 1.8 4 3.2-2.4-.2-4.2-1.4-5.8-3.2C9.4 17.6 7.6 18.8 5.2 19c.4-1.4 1.8-2.7 4-3.2-1.2.2-2.5-.3-3.4-1.5-1.2-1.6-2-4.4-.8-6.8z" fill="currentColor"/></svg>`,
  google_business: `<svg viewBox="0 0 24 24"><path d="M5 10.5 12 5l7 5.5V19a1 1 0 0 1-1 1h-4.2v-5.2H10.2V20H6a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  reddit: `<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9.6" cy="12.4" r="0.8" fill="currentColor"/><circle cx="14.4" cy="12.4" r="0.8" fill="currentColor"/><path d="M9.6 15.2c.8.7 1.6 1 2.4 1s1.6-.3 2.4-1M15.8 8.2l.6-2.2 2 .4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="18.6" cy="6.2" r="1" fill="currentColor"/></svg>`,
  snapchat: `<svg viewBox="0 0 24 24"><path d="M12 4.5c2.2 0 3.6 1.6 3.6 3.8v.7c.8.2 1.6.2 2.2.6.4 1.6-1 2.2-1.6 2.4.2.8.8 1.6 1.6 2-1.2.8-2.2.4-2.8.8.2 1.4-1.4 2.6-4 2.6h-2c-2.6 0-4.2-1.2-4-2.6-.6-.4-1.6 0-2.8-.8.8-.4 1.4-1.2 1.6-2-.6-.2-2-.8-1.6-2.4.6-.4 1.4-.4 2.2-.6v-.7c0-2.2 1.4-3.8 3.6-3.8z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24"><path d="M12 5.2a6.6 6.6 0 0 0-5.7 9.9L5.4 18.6l3.6-.9A6.6 6.6 0 1 0 12 5.2z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.4 10.2c.2 1.6 1.6 3.2 3.2 3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  generic: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`,
};

export function platformIcon(key) {
  const wrap = document.createElement("span");
  wrap.className = `plat plat-${String(key || "generic").replace(/[^a-z0-9_-]/gi, "")}`;
  wrap.innerHTML = GLYPHS[key] || GLYPHS.generic;
  wrap.setAttribute("aria-hidden", "true");
  return wrap;
}
