import { randomBytes } from "crypto";

export function generateId(): string {
  return Date.now().toString(36) + randomBytes(8).toString("hex");
}
