import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptProtectedJson,
  encryptProtectedJson,
  isProtectedEnvelope,
} from "../lib/security/dataProtection.js";

function withEncryptionKeys(current, previous, run) {
  const originalCurrent = process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY;
  const originalPrevious = process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY_PREVIOUS;
  process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY = current;
  if (previous) process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY_PREVIOUS = previous;
  else delete process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY_PREVIOUS;
  try {
    return run();
  } finally {
    if (originalCurrent === undefined) delete process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY;
    else process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY = originalCurrent;
    if (originalPrevious === undefined) delete process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY_PREVIOUS;
    else process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY_PREVIOUS = originalPrevious;
  }
}

test("protected records are authenticated and contain no readable client information", () => {
  withEncryptionKeys("11".repeat(32), null, () => {
    const clientRecord = {
      company: "Northstar Home Services",
      contact_name: "Jordan Lee",
      email: "jordan@northstar.example",
      phone: "(555) 014-0198",
      billing_address: "24 Market Street",
    };
    const encrypted = encryptProtectedJson(clientRecord, "admin-workspace");

    assert.equal(isProtectedEnvelope(encrypted), true);
    assert.equal(encrypted.includes(clientRecord.company), false);
    assert.equal(encrypted.includes(clientRecord.email), false);
    assert.deepEqual(decryptProtectedJson(encrypted, "admin-workspace"), clientRecord);
  });
});

test("protected records reject tampering and cross-purpose replay", () => {
  withEncryptionKeys("22".repeat(32), null, () => {
    const encrypted = encryptProtectedJson({ email: "owner@example.com" }, "admin-workspace");
    const parts = encrypted.split(".");
    const position = Math.floor(parts[3].length / 2);
    parts[3] = `${parts[3].slice(0, position)}${parts[3][position] === "a" ? "b" : "a"}${parts[3].slice(position + 1)}`;
    const tampered = parts.join(".");

    assert.throws(() => decryptProtectedJson(tampered, "admin-workspace"), /could not be decrypted/i);
    assert.throws(() => decryptProtectedJson(encrypted, "app-idea-intake"), /could not be decrypted/i);
  });
});

test("previous encryption key supports safe rotation while new writes use the active key", () => {
  let encryptedWithOldKey;
  withEncryptionKeys("33".repeat(32), null, () => {
    encryptedWithOldKey = encryptProtectedJson({ revision: 4 }, "admin-workspace");
  });

  withEncryptionKeys("44".repeat(32), "33".repeat(32), () => {
    assert.deepEqual(decryptProtectedJson(encryptedWithOldKey, "admin-workspace"), { revision: 4 });
    const encryptedWithNewKey = encryptProtectedJson({ revision: 5 }, "admin-workspace");
    assert.deepEqual(decryptProtectedJson(encryptedWithNewKey, "admin-workspace"), { revision: 5 });
  });

  withEncryptionKeys("33".repeat(32), null, () => {
    const encryptedWithNewKey = withEncryptionKeys("44".repeat(32), null, () =>
      encryptProtectedJson({ revision: 5 }, "admin-workspace")
    );
    assert.throws(() => decryptProtectedJson(encryptedWithNewKey, "admin-workspace"), /could not be decrypted/i);
  });
});

test("encryption fails closed when the key is missing or malformed", () => {
  withEncryptionKeys("", null, () => {
    assert.throws(
      () => encryptProtectedJson({ email: "owner@example.com" }, "admin-workspace"),
      /FIRSTSTEP_DATA_ENCRYPTION_KEY/,
    );
  });
  withEncryptionKeys("not-a-64-character-hex-key", null, () => {
    assert.throws(
      () => encryptProtectedJson({ email: "owner@example.com" }, "admin-workspace"),
      /FIRSTSTEP_DATA_ENCRYPTION_KEY/,
    );
  });
});
