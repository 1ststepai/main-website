import { mcpError } from "../errors.js";

export async function handleHookRoutes(req, res, { url, engine, sendJson, readJson, snapshot }) {
  if (!url.pathname.startsWith("/api/hook")) return false;
  const hooks = engine.hooks;
  if (!hooks) throw mcpError("hook_unavailable", "Opening capture is not available.", 503);

  if (req.method === "GET" && url.pathname === "/api/hook/help") {
    sendJson(res, 200, { ok: true, help: hooks.help(), ...hooks.listVoices() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/hook/voice") {
    const body = await readJson(req);
    sendJson(res, 200, { ok: true, ...hooks.saveVoice(body) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/hook/find") {
    const body = await readJson(req);
    sendJson(res, 200, { ok: true, ...(await hooks.find(body)) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/hook/capture") {
    const body = await readJson(req);
    sendJson(res, 200, { ok: true, ...(await hooks.capture(body)) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/hook/generate") {
    const body = await readJson(req);
    const result = await hooks.generate(body);
    sendJson(res, 200, { ok: true, ...result, ...(result.attached ? snapshot() : {}) });
    return true;
  }

  sendJson(res, 404, { ok: false, message: "Not found" });
  return true;
}
