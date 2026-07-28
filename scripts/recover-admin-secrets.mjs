import { randomBytes } from "node:crypto";
import { hashAdminPassword } from "../lib/admin/auth.js";

function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Run this command directly in an interactive PowerShell terminal.");
  }

  return new Promise((resolve, reject) => {
    let value = "";

    function cleanup() {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    function onData(chunk) {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Recovery cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (character.codePointAt(0) >= 32) value += character;
      }
    }

    process.stdout.write(prompt);
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

async function main() {
  process.stdout.write([
    "This keeps your existing owner password and authenticator setup.",
    "The password is hidden and is not printed, logged, or saved.",
    "",
  ].join("\n"));

  let password = await readHidden("Paste the saved OWNER_PASSWORD, then press Enter: ");
  let confirmation = await readHidden("Paste it again to confirm, then press Enter: ");
  if (password !== confirmation) {
    password = "";
    confirmation = "";
    throw new Error("The passwords did not match. No secrets were generated.");
  }

  const passwordHash = hashAdminPassword(password);
  password = "";
  confirmation = "";

  process.stdout.write([
    "",
    "Add these exact values to Vercel Production:",
    "FIRSTSTEP_ADMIN_REQUIRE_PASSWORD_HASH=true",
    `FIRSTSTEP_ADMIN_PASSWORD_HASH=${passwordHash}`,
    `FIRSTSTEP_ADMIN_SESSION_SECRET=${randomBytes(32).toString("hex")}`,
    `FIRSTSTEP_DATA_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`,
    "",
    "Do not add OWNER_PASSWORD or FIRSTSTEP_ADMIN_PASSWORD to Vercel.",
    "Back up FIRSTSTEP_DATA_ENCRYPTION_KEY securely before storing real client data.",
    "",
  ].join("\n"));
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
