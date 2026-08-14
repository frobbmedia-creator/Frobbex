import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { BridgeError } from "./errors.js";

interface ConfirmationStoreOptions {
  now?: () => number;
  ttlMs?: number;
  secret?: Buffer;
}

interface ConfirmationRecord {
  digest: string;
  summary: string;
  expiresAt: number;
}

export class ConfirmationStore {
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly secret: Buffer;
  private readonly records = new Map<string, ConfirmationRecord>();

  constructor(options: ConfirmationStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? 300_000;
    this.secret = options.secret ?? randomBytes(32);
  }

  prepare(action: unknown, summary: string): { token: string; summary: string; expiresAt: number } {
    const token = randomUUID();
    const expiresAt = this.now() + this.ttlMs;
    this.records.set(token, { digest: this.digest(action), summary, expiresAt });
    return { token, summary, expiresAt };
  }

  consume(token: string, action: unknown): ConfirmationRecord {
    const record = this.records.get(token);
    this.records.delete(token);
    if (!record || record.expiresAt <= this.now() || record.digest !== this.digest(action)) {
      throw new BridgeError("INVALID_CONFIRMATION", "Confirmation is invalid, expired, or already used");
    }
    return record;
  }

  private digest(action: unknown): string {
    return createHmac("sha256", this.secret).update(canonicalJson(action)).digest("hex");
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
