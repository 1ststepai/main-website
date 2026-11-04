import { mcpError, formatToolError } from "../errors.js";

const ID_KEYS = ["post_id", "bundle_id", "draft_id"];
const MAP_KEYS = new Set(["profiles", "brands", "by_profile", "by_brand"]);

/** Brand allowlist from an auth gate. null = every brand. */
export function gateProfiles(gate) {
  const list = gate && Array.isArray(gate.profiles) ? gate.profiles.filter(Boolean).map(String) : [];
  return list.length ? list : null;
}

function refusal(id, allowed) {
  return mcpError(
    "brand_not_allowed",
    `This connector token is limited to brand ${allowed.join(", ")}. "${String(id).slice(0, 64)}" is outside that list, so the call was refused. Ask the owner for a token that includes that brand.`,
    403,
  );
}

function ownerOf(store, id) {
  if (!id) return undefined;
  const post = store.getPost?.(id);
  if (post) return post.profile_id;
  const bundle = store.getBundle?.(id);
  if (bundle) {
    if (bundle.profile_id) return bundle.profile_id;
    const child = Object.values(bundle.child_ids || {}).map((cid) => store.getPost?.(cid)).find(Boolean);
    return child?.profile_id ?? null;
  }
  return undefined;
}

/**
 * Check one tool call's arguments against the allowlist and fill in a brand when
 * the call would otherwise touch every brand. Throws brand_not_allowed.
 */
export function enforceBrandArgs({ allowed, store, args, shapeKeys, readOnly }) {
  if (!allowed) return args;
  const next = { ...(args || {}) };
  if (next.profile_id !== undefined && !allowed.includes(String(next.profile_id).toLowerCase())) throw refusal(next.profile_id, allowed);
  if (Array.isArray(next.profile_ids)) {
    const bad = next.profile_ids.find((id) => !allowed.includes(String(id).toLowerCase()));
    if (bad !== undefined) throw refusal(bad, allowed);
  }
  let hasId = false;
  for (const key of ID_KEYS) {
    if (!next[key]) continue;
    hasId = true;
    const owner = ownerOf(store, next[key]);
    // Unknown ids are left to the tool to report. A known record with no brand is refused.
    if (owner === undefined) continue;
    if (owner === null || !allowed.includes(String(owner).toLowerCase())) throw refusal(owner || next[key], allowed);
  }
  if (next.profile_id === undefined && next.profile_ids === undefined && !hasId) {
    if (shapeKeys.includes("profile_ids")) next.profile_ids = [...allowed];
    else if (shapeKeys.includes("profile_id")) {
      if (allowed.length === 1) next.profile_id = allowed[0];
      else if (!readOnly) throw mcpError("brand_required", `This connector token covers several brands (${allowed.join(", ")}). Pass profile_id for this call.`, 400);
    }
  }
  return next;
}

/** Remove other brands' rows from a tool result. */
export function scrubForBrands(value, allowed, parentKey = "") {
  if (!allowed || value === null || typeof value !== "object") return value;
  const inList = (id) => allowed.includes(String(id).toLowerCase());
  if (Array.isArray(value)) {
    return value
      .filter((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return true;
        if ("profile_id" in item && item.profile_id !== null && item.profile_id !== undefined && !inList(item.profile_id)) return false;
        if (MAP_KEYS.has(parentKey) && "id" in item && !("profile_id" in item) && !inList(item.id)) return false;
        return true;
      })
      .map((item) => scrubForBrands(item, allowed, parentKey));
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (MAP_KEYS.has(parentKey) && item && typeof item === "object" && !Array.isArray(item) && /^[a-z0-9][a-z0-9_-]{1,63}$/.test(key) && !("profile_id" in item) && !("id" in item) && !inList(key)) continue;
    out[key] = scrubForBrands(item, allowed, key);
  }
  return out;
}

function shapeKeysOf(schema) {
  if (!schema) return [];
  if (typeof schema.shape === "object") return Object.keys(schema.shape);
  if (typeof schema === "object") return Object.keys(schema);
  return [];
}

/**
 * Wrap server.registerTool / registerResource so every tool and resource registered
 * on this server (core, SEO and hook tools alike) enforces the token's brand list.
 */
export function installBrandGuard(server, { gate, store }) {
  const allowed = gateProfiles(gate);
  if (!allowed) return null;
  const rawTool = server.registerTool.bind(server);
  server.registerTool = (name, config, handler) => {
    const shapeKeys = shapeKeysOf(config?.inputSchema);
    const readOnly = Boolean(config?.annotations?.readOnlyHint);
    return rawTool(name, config, async (args, extra) => {
      let checked;
      try {
        checked = enforceBrandArgs({ allowed, store, args, shapeKeys, readOnly });
      } catch (error) {
        return formatToolError(error);
      }
      const result = await handler(checked, extra);
      if (!result || result.isError || !result.structuredContent) return result;
      const structuredContent = scrubForBrands(result.structuredContent, allowed);
      return { ...result, structuredContent, content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }] };
    });
  };
  if (typeof server.registerResource === "function") {
    const rawResource = server.registerResource.bind(server);
    server.registerResource = (name, uriOrTemplate, metadata, reader) => rawResource(name, uriOrTemplate, metadata, async (uri, vars, extra) => {
      const brand = vars?.profile_id ?? vars?.brand ?? new URL(String(uri)).searchParams.get("profile_id");
      if (brand !== undefined && brand !== null && !allowed.includes(String(brand).toLowerCase())) throw refusal(brand, allowed);
      const result = await reader(uri, vars, extra);
      if (!result?.contents) return result;
      return {
        ...result,
        contents: result.contents.map((item) => {
          if (typeof item.text !== "string") return item;
          try {
            return { ...item, text: JSON.stringify(scrubForBrands(JSON.parse(item.text), allowed), null, 2) };
          } catch {
            return item;
          }
        }),
      };
    });
  }
  return allowed;
}
