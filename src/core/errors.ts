import type { NormalizedErrorCode } from "./contracts.js";

const RETRYABLE_CODES = new Set<NormalizedErrorCode>([
  "BACKEND_OFFLINE",
  "STALE_OBSERVATION",
  "TARGET_GONE",
]);

export class BridgeError extends Error {
  readonly code: NormalizedErrorCode;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(code: NormalizedErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.retryable = RETRYABLE_CODES.has(code);
    this.details = details;
  }

  toJSON(): { code: NormalizedErrorCode; message: string; retryable: boolean; details?: unknown } {
    return { code: this.code, message: this.message, retryable: this.retryable, details: this.details };
  }
}
