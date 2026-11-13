import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { PLATFORMS } from "../src/platforms.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = join(root, "skills/postpath-publishing/SKILL.md");
const indexSource = readFileSync(join(root, "src/index.js"), "utf8");
const skill = readFileSync(skillPath, "utf8");

const REAL_TOOLS = [
  "status",
  "upsert_profile",
  "list_accounts",
  "connect_accounts",
  "connect_bluesky",
  "create_draft",
  "update_draft",
  "schedule_post",
  "publish_post",
  "publish_due",
  "list_posts",
  "get_post_status",
];

test("index.js registers exactly the audited PostPath tools", () => {
  for (const tool of REAL_TOOLS) {
    assert.match(indexSource, new RegExp(`"${tool}"`), `missing tool registration: ${tool}`);
  }
  assert.equal(indexSource.includes("connect_caldav"), false, "main PostPath must not invent connect_caldav");
  assert.equal(indexSource.includes('"hubspot"'), false, "main PostPath must not invent hubspot tool args");
});

test("publishing skill documents every real tool and no invented ones", () => {
  for (const tool of REAL_TOOLS) {
    assert.match(skill, new RegExp(`\`${tool}\``), `skill missing tool: ${tool}`);
  }
  const invented = [
    "send_lead",
    "create_crm_contact",
    "sync_crm",
    "connect_caldav",
    "publish_to_all",
    "generate_caption",
    "auto_reply",
    "scrape_comments",
  ];
  for (const name of invented) {
    assert.equal(skill.includes(`\`${name}\``), false, `skill must not invent tool ${name}`);
  }
});

test("publishing skill only names real platforms", () => {
  for (const platform of PLATFORMS) {
    assert.match(skill, new RegExp(`\`${platform}\``), `skill missing platform: ${platform}`);
  }
  assert.match(skill, /Never claim published/i);
  assert.match(skill, /publish_due/);
  assert.match(skill, /No CRM/);
});
