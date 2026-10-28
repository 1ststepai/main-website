import { mcpError } from "../errors.js";

export async function handleSeoRoutes(req, res, { url, engine, sendJson, readJson, snapshot }) {
  if (!url.pathname.startsWith("/api/seo")) return false;
  const seo = engine.seo;
  if (!seo) throw mcpError("seo_unavailable", "SEO step is not available.", 503);

  if (req.method === "GET" && url.pathname === "/api/seo/help") {
    sendJson(res, 200, { ok: true, help: seo.help() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/seo") {
    const profileId = url.searchParams.get("profile_id") || "";
    sendJson(res, 200, {
      ok: true,
      ...seo.listKeywordProfiles(),
      help: seo.help(),
      search: profileId ? seo.searchDataStatus(profileId) : null,
      planner: seo.keywordPlanner(),
      trends: seo.trends(),
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/seo/report") {
    sendJson(res, 200, { ok: true, report: seo.weeklyReport({ days: url.searchParams.get("days") || 7, profile_id: url.searchParams.get("profile_id") || undefined }) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/seo/keywords") {
    const body = await readJson(req);
    sendJson(res, 200, { ok: true, ...seo.saveKeywordProfile(body), ...snapshot() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/seo/suggest") {
    const body = await readJson(req);
    sendJson(res, 200, { ok: true, ...(await seo.suggestKeywords(body)) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/seo/draft") {
    const body = await readJson(req);
    sendJson(res, 200, { ok: true, ...(await seo.draft(body)) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/seo/score") {
    const body = await readJson(req);
    sendJson(res, 200, { ok: true, seo: seo.score(body) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/seo/queue") {
    const body = await readJson(req);
    const result = await seo.queueDrafts({ ...body, source: "desk" });
    sendJson(res, 200, { ok: true, ...result, ...snapshot() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/seo/research") {
    const body = await readJson(req);
    const result = seo.attachKeywordResearch(body);
    sendJson(res, 200, { ok: true, ...result, ...snapshot() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/seo/search/connect") {
    const body = await readJson(req);
    const result = await seo.connectSearchData(body);
    sendJson(res, 200, { ok: true, ...result, ...snapshot() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/seo/search/sync") {
    const body = await readJson(req);
    const result = await seo.syncSearchTerms(body);
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  sendJson(res, 404, { ok: false, message: "Not found" });
  return true;
}
