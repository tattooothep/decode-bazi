import { randomUUID } from "crypto";

export function mobileBillingOperation(value: unknown): string {
  const supplied = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9._:-]{8,160}$/.test(supplied) ? supplied : randomUUID();
}
