import test from "node:test";
import assert from "node:assert/strict";
import { saveReportIntake } from "../lib/appIdeaChecker/storageAdapter.js";
import {
  decryptProtectedJson,
  isProtectedEnvelope,
} from "../lib/security/dataProtection.js";
import { createEmptyWorkspace } from "../lib/admin/workspaceModel.js";
import {
  loadAdminWorkspace,
  saveAdminWorkspace,
} from "../lib/admin/workspaceStore.js";

function clientWorkspace() {
  return {
    ...createEmptyWorkspace(),
    clients: [{
      id: "client_secure",
      company: "Private Client LLC",
      contact_name: "Private Owner",
      email: "private@example.com",
      phone: "(555) 010-1000",
      website: "https://private.example",
      billing_address: "100 Private Street",
    }],
  };
}

async function withProtectedKv(initialValue, run) {
  const originalFetch = globalThis.fetch;
  const original = {
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
    key: process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY,
    previous: process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY_PREVIOUS,
  };
  let stored = initialValue;
  process.env.KV_REST_API_URL = "https://kv.example.test";
  process.env.KV_REST_API_TOKEN = "test-kv-token";
  process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY = "55".repeat(32);
  delete process.env.FIRSTSTEP_DATA_ENCRYPTION_KEY_PREVIOUS;
  globalThis.fetch = async (_url, options) => {
    const command = JSON.parse(options.body);
    if (command[0] === "GET") {
      return new Response(JSON.stringify({ result: stored }), { status: 200 });
    }
    if (command[0] === "SET") {
      stored = command[2];
      return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
    }
    throw new Error(`Unexpected command ${command[0]}`);
  };

  try {
    await run(() => stored);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({
      KV_REST_API_URL: original.url,
      KV_REST_API_TOKEN: original.token,
      FIRSTSTEP_DATA_ENCRYPTION_KEY: original.key,
      FIRSTSTEP_DATA_ENCRYPTION_KEY_PREVIOUS: original.previous,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("legacy admin JSON is migrated before it is returned and future saves stay encrypted", async () => {
  const legacy = clientWorkspace();
  await withProtectedKv(JSON.stringify(legacy), async (storedValue) => {
    const loaded = await loadAdminWorkspace();
    assert.equal(loaded.clients[0].email, "private@example.com");
    assert.equal(isProtectedEnvelope(storedValue()), true);
    assert.equal(storedValue().includes("private@example.com"), false);

    loaded.clients[0].company = "Updated Private Client";
    const saved = await saveAdminWorkspace(loaded, loaded.revision);
    assert.equal(saved.revision, 1);
    assert.equal(storedValue().includes("Updated Private Client"), false);
    assert.equal(
      decryptProtectedJson(storedValue(), "admin-workspace").clients[0].company,
      "Updated Private Client",
    );
  });
});

test("persisted App Idea Checker leads and generated files are encrypted before KV", async () => {
  await withProtectedKv(null, async (storedValue) => {
    const result = await saveReportIntake({
      lead: {
        lead_id: "lead_secure_1",
        project_slug: "private-business-idea",
        name: "Private Founder",
        email: "founder@example.com",
      },
      files: [{
        path: "generated-projects/private-business-idea/brief.md",
        content: "Private product plan for founder@example.com",
      }],
    });

    assert.equal(result.persisted, true);
    assert.equal(isProtectedEnvelope(storedValue()), true);
    assert.equal(storedValue().includes("Private Founder"), false);
    assert.equal(storedValue().includes("founder@example.com"), false);
    const decrypted = decryptProtectedJson(storedValue(), "app-idea-intake");
    assert.equal(decrypted.lead.email, "founder@example.com");
    assert.equal(decrypted.files[0].content.includes("Private product plan"), true);
  });
});
