import { randomBytes } from "node:crypto";

export function socialId(prefix) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}
