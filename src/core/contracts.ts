export type Backend = "chrome" | "cua";

export type ActionRisk = "observe" | "reversible" | "consequential";

export type NormalizedErrorCode =
  | "BACKEND_OFFLINE"
  | "PERMISSION_REQUIRED"
  | "AUTH_FAILED"
  | "STALE_OBSERVATION"
  | "TARGET_GONE"
  | "ACTION_UNVERIFIED"
  | "CONFIRMATION_REQUIRED"
  | "INVALID_CONFIRMATION"
  | "INVALID_INPUT"
  | "INTERNAL_ERROR";

export interface ObservationHandle {
  id: string;
  backend: Backend;
  target: string;
  createdAt: number;
  expiresAt: number;
  revision: string;
}

export interface ActionResult<T = unknown> {
  ok: boolean;
  code: "OK" | NormalizedErrorCode;
  data?: T;
  message: string;
  correlationId: string;
}

export function isObservationHandle(value: unknown): value is ObservationHandle {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    (candidate.backend === "chrome" || candidate.backend === "cua") &&
    typeof candidate.target === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.expiresAt === "number" &&
    typeof candidate.revision === "string"
  );
}
