# PostPath security notes (personal use)

## Brand-scoped MCP tokens
* `postpath pat create --label X --brands 1ststep-ai,skillsprout` limits the token to those brands. With no `--brands`, or `--brands all` (or `*`), the token covers all brands. The desk's "Create token" form has the same choice: an "All brands" checkbox or a pick-list.
* Unknown brand ids are rejected when the token is created.
* Enforcement lives in `src/mcp/brandScope.js`. It wraps every `registerTool` and `registerResource` call, so core, SEO and hook tools are all covered. It works like this:
  * `profile_id` and `profile_ids` outside the allowlist give `brand_not_allowed` (403).
  * `post_id`, `bundle_id` and `draft_id` are traced back to the brand that owns them and checked the same way.
  * A call that names no brand is narrowed to the allowed brands. On a multi-brand token, a write that names no brand gives `brand_required`.
  * Results are scrubbed of rows that belong to other brands.
* Stdio sessions can be limited with `POSTPATH_MCP_BRANDS=a,b`.

## Per-brand credential isolation
* Connection secrets are stored per `(profile_id, platform)` and sealed with AES-256-GCM. The AAD purpose is `conn:<profile>:<platform>` (`secrets_aad: "brand_v2"`), so ciphertext copied onto another brand's row will not decrypt.
* Rows written before this change used `conn:<platform>`. They still decrypt, and they are re-sealed with brand binding on the next `updateSecrets` (for example a token refresh) or reconnect.
* MCP results go through `stripSecretFields` (`secrets`, `secrets_enc`, `access_token`, `refresh_token` and similar). A bug where `connectBluesky` returned the raw row, including `secrets_enc`, is fixed.
* Meta: each brand stores only its own Page token. Google: each brand stores its own refresh token.

## Log redaction
`src/redact.js` handles log redaction. Console output (via `installLogRedaction` in the bin), CLI output, desk errors, MCP tool errors and `events.jsonl` all mask the following:
* PostPath PAT, OAuth access, refresh and code tokens
* sealed envelopes
* Bearer and Basic headers
* Google `ya29.` and `1//` tokens and Meta `EA…` tokens
* OpenAI and Anthropic `sk-`, Slack, GitHub and Google API keys
* JWTs
* `key=value` or `"key":"value"` pairs for secret-named keys
