export const CONNECTION_STATUSES = ["connected_verified", "setup_needed", "disconnected", "blocked"];

export const STATUS_LABELS = {
  connected_verified: "Connected and verified",
  setup_needed: "Setup needed",
  disconnected: "Disconnected",
  blocked: "Blocked",
};

const GROK_ROLES = [
  ["general-manager", "General Manager", "BRIDGE_GENERAL_MANAGER_TOKEN"],
  ["engineering", "Engineering", "BRIDGE_ENGINEERING_TOKEN"],
  ["qa-release", "QA / Release", "BRIDGE_QA_RELEASE_TOKEN"],
  ["content", "Content", "BRIDGE_CONTENT_TOKEN"],
  ["ops", "Ops", "BRIDGE_OPS_TOKEN"],
  ["growth", "Growth", "BRIDGE_GROWTH_TOKEN"],
];

export const CONNECTIONS = [
  {
    id: "studio-read",
    label: "Studio read",
    product: "Studio",
    mode: "server",
    tokenEnv: "AGENT_HANDOFF_BRIDGE_READ_TOKEN",
    localTokenEnv: "AGENT_HANDOFF_BRIDGE_READ_TOKEN",
    summary: "Authenticated read of the bridge from Studio.",
  },
  {
    id: "codex",
    label: "Codex",
    product: "Codex",
    mode: "cli",
    cli: "codex",
    serverName: "agent-handoff-bridge",
    tokenEnv: "AGENT_HANDOFF_BRIDGE_CODEX_TOKEN",
    localTokenEnv: "BRIDGE_CODEX_TOKEN",
    summary: "Codex plugin uses BRIDGE_CODEX_TOKEN from the environment. The token is not written into the plugin file.",
  },
  {
    id: "dot",
    label: "OpenAI Dot",
    product: "ChatGPT",
    mode: "blocked",
    reason: "A ChatGPT custom MCP app is created in the ChatGPT workspace. This server has no API for that screen.",
    nextStep: "In ChatGPT developer settings, add a custom MCP app for the bridge /mcp path. Do not paste the token into chat or Studio.",
  },
  {
    id: "cursor",
    label: "Cursor",
    product: "Cursor",
    mode: "blocked",
    reason: "agent-handoff-bridge 0.5.0 authenticates Codex, Dot, and the STP Grok roles. It has no Cursor actor. Another actor's token must not be reused.",
    nextStep: "Add a distinct Cursor credential on the bridge, then run connection setup again.",
  },
  ...GROK_ROLES.map(([role, label, localTokenEnv]) => ({
    id: `grok-${role}`,
    label: `Grok ${label}`,
    product: "Grok",
    mode: "cli",
    cli: "grok",
    role,
    serverName: `agent-bridge-${role}`,
    tokenEnv: `AGENT_HANDOFF_BRIDGE_${role.replaceAll("-", "_").toUpperCase()}_TOKEN`,
    localTokenEnv,
    summary: "Grok CLI can register an HTTP MCP server. The hosted Grok connector still needs a public HTTPS URL and a person to confirm it.",
  })),
];

export function connectionById(id) {
  return CONNECTIONS.find((entry) => entry.id === id) || null;
}

export function previewConnections() {
  return CONNECTIONS.map((entry) => ({
    id: entry.id,
    label: entry.label,
    product: entry.product,
    status: entry.mode === "blocked" ? "blocked" : "setup_needed",
    verified: false,
    credential_configured: false,
    credential_accepted: false,
    product_configured: false,
    message: entry.mode === "blocked"
      ? entry.reason
      : "Not checked in local preview. A saved setting is not a connection.",
    next_step: entry.mode === "blocked"
      ? entry.nextStep
      : "Open the protected Studio and run Verify. Local preview does not contact the bridge.",
  }));
}
