import { describe, expect, it } from "vitest";

import { BridgeError, isObservationHandle } from "../../src/core/index.js";

describe("core contracts", () => {
  it("recognizes valid observation handles", () => {
    expect(
      isObservationHandle({
        id: "o1",
        backend: "tandem",
        target: "tab:1",
        createdAt: 1,
        expiresAt: 2,
        revision: "r1",
      }),
    ).toBe(true);
  });

  it("serializes stable bridge errors", () => {
    expect(new BridgeError("BACKEND_OFFLINE", "Tandem is offline").toJSON()).toEqual({
      code: "BACKEND_OFFLINE",
      message: "Tandem is offline",
      retryable: true,
    });
  });
});
