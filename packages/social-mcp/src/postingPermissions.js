// What an assistant may do per brand + network, with the real approval counts behind it.
import { OWNER_ONLY_NOTE, networkMode } from "./autoPost.js";
import { READINESS_THRESHOLDS, readinessFor } from "./approvalHistory.js";
import { isXPlatform, xAvailable } from "./xAccess.js";
import { PLATFORMS } from "./home.js";

function brandNetworks(store, profile) {
  const set = new Set();
  for (const conn of store.listConnections(profile.id)) if (conn?.platform) set.add(conn.platform);
  for (const platform of profile.presets?.platforms || []) set.add(platform);
  const xOk = xAvailable(store.homePaths);
  return PLATFORMS.filter((platform) => set.has(platform) && (xOk || !isXPlatform(platform)));
}

export function postingPermissions(store, { profile_id } = {}) {
  const profiles = store.listProfiles().filter((profile) => !profile_id || profile.id === profile_id);
  const rows = [];
  for (const profile of profiles) {
    for (const platform of brandNetworks(store, profile)) {
      const mode = networkMode(store, profile.id, platform);
      rows.push({
        profile_id: profile.id,
        brand: profile.name || profile.id,
        platform,
        mode,
        mode_label: mode === "auto" ? "Auto-post" : mode === "review" ? "Review each post" : "Auto-post for some connections",
        readiness: readinessFor(store, profile.id, platform),
      });
    }
  }
  return {
    default_mode: "review",
    assistant_can: ["read", "draft into the approval queue", "publish only where mode is Auto-post"],
    owner_only: OWNER_ONLY_NOTE,
    thresholds: READINESS_THRESHOLDS,
    networks: rows,
  };
}
