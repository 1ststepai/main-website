import { mcpError } from "../errors.js";

/**
 * Snapchat Marketing API and WhatsApp Channels publishing are approval-gated.
 * Keep connect scaffolding, but refuse silent fake publishes.
 */
export async function publishSnapchatScaffold() {
  throw mcpError(
    "snapchat_api_restricted",
    "Snapchat publishing requires Marketing API / Public Profile approval. Connection can be stored; live publish is not available without that access.",
    501,
  );
}

export async function publishWhatsAppScaffold() {
  throw mcpError(
    "whatsapp_api_restricted",
    "WhatsApp Channels do not offer a free third-party publish API for this product. Connection scaffolding only — use Meta Business tools for Channels until an approved API path exists.",
    501,
  );
}
