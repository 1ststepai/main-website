// Small DOM + request helpers shared by the desk feature modules.
import { deskUrl } from "./deskApi.js";

export const NETWORK_NAMES = {
  youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", x: "X",
  threads: "Threads", pinterest: "Pinterest", bluesky: "Bluesky", google_business: "Google Business", reddit: "Reddit", snapchat: "Snapchat", whatsapp: "WhatsApp",
};
export const netName = (id) => NETWORK_NAMES[id] || id;


export function node(tag, attrs = {}, text) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else el.setAttribute(key, value);
  }
  if (text !== undefined) el.textContent = text;
  return el;
}

export function toast(message, bad = false) {
  const box = document.getElementById("toast");
  if (!box) return;
  box.textContent = message;
  box.classList.toggle("error", bad);
  box.hidden = false;
  setTimeout(() => { box.hidden = true; }, 4000);
}

export async function post(route, body, pin = "") {
  const headers = { "content-type": "application/json", "x-postpath-desk": "1" };
  if (pin) headers["x-postpath-owner-pin"] = pin;
  const response = await fetch(deskUrl(route), { method: "POST", headers, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.message || "Request failed");
  return payload;
}
