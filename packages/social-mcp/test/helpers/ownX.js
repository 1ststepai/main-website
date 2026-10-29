// Test desks that exercise X act like a desk whose user saved their own X app.
import { writeFileSync } from "node:fs";
import { paths } from "../../src/home.js";

export function giveOwnX(home) {
  writeFileSync(paths(home).oauthEnv, "X_CLIENT_ID=x\nX_CLIENT_SECRET=test-x-value\n");
  return home;
}
