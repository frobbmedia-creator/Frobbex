import { describe, expect, it } from "vitest";

import { AuditLogger } from "../../src/core/audit.js";
import { ConfirmationStore } from "../../src/core/confirmation.js";
import { ObservationStore } from "../../src/core/observations.js";
import { withReadRetry } from "../../src/core/retry.js";
import { BridgeError } from "../../src/core/index.js";

describe("bridge policy", () => {
  it("binds confirmation to an exact action and permits one use", () => {
    const store = new ConfirmationStore({ now: () => 1_000, secret: Buffer.alloc(32, 7) });
    const action = { kind: "browser_click", target: "publish" };
    const prepared = store.prepare(action, "Publish the post");

    expect(store.consume(prepared.token, action).summary).toBe("Publish the post");
    expect(() => store.consume(prepared.token, action)).toThrowError(
      expect.objectContaining({ code: "INVALID_CONFIRMATION" }),
    );
  });

  it("rejects a confirmation token for different arguments", () => {
    const store = new ConfirmationStore({ now: () => 1_000, secret: Buffer.alloc(32, 7) });
    const prepared = store.prepare({ kind: "browser_click", target: "publish" }, "Publish");

    expect(() =>
      store.consume(prepared.token, { kind: "browser_click", target: "delete" }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONFIRMATION" }));
  });

  it("expires an observation after one use", () => {
    const store = new ObservationStore({ now: () => 1_000, ttlMs: 30_000 });
    const handle = store.issue("chrome", "tab:1", "rev");

    expect(store.consume(handle.id, "chrome", "tab:1")).toEqual(handle);
    expect(() => store.consume(handle.id, "chrome", "tab:1")).toThrowError(
      expect.objectContaining({ code: "STALE_OBSERVATION" }),
    );
  });

  it("makes no more than two retries for retryable reads", async () => {
    let attempts = 0;
    const result = await withReadRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new BridgeError("BACKEND_OFFLINE", "offline");
        return "ready";
      },
      { sleep: async () => undefined },
    );

    expect(result).toBe("ready");
    expect(attempts).toBe(3);
  });

  it("redacts undeclared fields from audit events", () => {
    const events: unknown[] = [];
    const logger = new AuditLogger((event) => events.push(event));

    logger.record({
      timestamp: 1,
      correlationId: "c1",
      tool: "browser_type",
      targetClass: "browser",
      resultCode: "OK",
      durationMs: 4,
      text: "super-secret",
    } as never);

    expect(events).toEqual([
      {
        timestamp: 1,
        correlationId: "c1",
        tool: "browser_type",
        targetClass: "browser",
        resultCode: "OK",
        durationMs: 4,
      },
    ]);
  });
});
