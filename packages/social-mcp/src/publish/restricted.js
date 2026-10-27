import { mcpError } from "../errors.js";

/**
 * Snapchat Marketing API and WhatsApp Channels publishing are approval-gated.
 * Keep connect scaffolding, but refuse silent fake publishes.
 * Snapchat may store a refresh_token at connect time. This scaffold does not
 * call Snapchat, so that token is not refreshed and no post is dispatched.
 * WhatsApp has no refresh token and no free publish API.
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
