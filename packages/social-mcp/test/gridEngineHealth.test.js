import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionHealthRow } from "../src/connectionHealth.js";
import { connectionGrid, useEngineHealth } from "../src/personal/connectionHealth.js";

const DAY = 86_400_000;

test("grid shows #78 engine health: Google Testing 7-day expiry and live connections", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const conns = {
    "swing-trade-pros": [
      { profile_id: "swing-trade-pros", platform: "youtube", account_label: "STP", has_secrets: true, token_meta: { authorized_at: new Date(now - 8 * DAY).toISOString(), has_refresh_token: true } },
      { profile_id: "swing-trade-pros", platform: "facebook", account_label: "STP page", has_secrets: true, token_meta: { authorized_at: new Date(now - DAY).toISOString() } },
    ],
  };
  const off = useEngineHealth(connectionHealthRow, { googleTesting: () => true });
  try {
    const grid = connectionGrid({ listConnections: (id) => conns[id] || [], appReady: { google: true, meta: true }, now, googleTesting: true });
    const row = grid.rows.find((r) => r.brand_id === "swing-trade-pros");
    const cell = (p) => row.cells.find((c) => c.platform === p);
    assert.equal(cell("youtube").state, "expired", JSON.stringify(cell("youtube")));
    assert.equal(cell("facebook").state, "connected", JSON.stringify(cell("facebook")));
    assert.match(grid.youtube_nudge.message, /Reconnect YouTube/);
    assert.doesNotMatch(JSON.stringify(grid), /access_token|refresh_token"|secret/i);
  } finally {
    off();
  }
});
