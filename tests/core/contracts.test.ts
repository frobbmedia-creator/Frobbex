import { describe, expect, it } from "vitest";

import { BridgeError, isObservationHandle } from "../../src/core/index.js";

describe("core contracts", () => {
  it("recognizes valid observation handles", () => {
    expect(
      isObservationHandle({
        id: "o1",
        backend: "chrome",
        target: "tab:1",
        createdAt: 1,
        expiresAt: 2,
        revision: "r1",
      }),
    ).toBe(true);
  });

  it("serializes stable bridge errors", () => {
    expect(new BridgeError("BACKEND_OFFLINE", "Chrome is offline").toJSON()).toEqual({
      code: "BACKEND_OFFLINE",
      message: "Chrome is offline",
      retryable: true,
    });
  });
});
