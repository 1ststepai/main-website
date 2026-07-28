import { randomBytes } from "node:crypto";
import { hashAdminPassword } from "../lib/admin/auth.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

const password = randomBytes(24).toString("base64url");
const totpSecret = base32(randomBytes(20));
const account = encodeURIComponent("evan@1ststep.ai");
const issuer = encodeURIComponent("1stStep Studio");

console.log([
  "Store the password in your password manager and add the remaining values to Vercel.",
  "Do not commit or email this output.",
  "",
  `OWNER_PASSWORD=${password}`,
  `FIRSTSTEP_ADMIN_PASSWORD_HASH=${hashAdminPassword(password)}`,
  `FIRSTSTEP_ADMIN_SESSION_SECRET=${randomBytes(32).toString("hex")}`,
  `FIRSTSTEP_ADMIN_TOTP_SECRET=${totpSecret}`,
  `FIRSTSTEP_DATA_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`,
  "",
  "Authenticator setup URI:",
  `otpauth://totp/${issuer}:${account}?secret=${totpSecret}&issuer=${issuer}&digits=6&period=30`,
].join("\n"));
