import { randomUUID } from "node:crypto";

import type { Backend, ObservationHandle } from "./contracts.js";
import { BridgeError } from "./errors.js";

interface ObservationStoreOptions {
  now?: () => number;
  ttlMs?: number;
}

export class ObservationStore {
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly handles = new Map<string, ObservationHandle>();

  constructor(options: ObservationStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? 30_000;
  }

  issue(backend: Backend, target: string, revision: string): ObservationHandle {
    const createdAt = this.now();
    const handle: ObservationHandle = {
      id: randomUUID(),
      backend,
      target,
      createdAt,
      expiresAt: createdAt + this.ttlMs,
      revision,
    };
    this.handles.set(handle.id, handle);
    return handle;
  }

  consume(id: string, backend: Backend, target: string): ObservationHandle {
    const handle = this.handles.get(id);
    this.handles.delete(id);
    if (
      !handle ||
      handle.backend !== backend ||
      handle.target !== target ||
      handle.expiresAt <= this.now()
    ) {
      throw new BridgeError("STALE_OBSERVATION", "A fresh matching observation is required");
    }
    return handle;
  }
}
