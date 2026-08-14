import { describe, expect, it } from "vitest";

import { BridgeError } from "../../src/core/index.js";
import { TandemAdapter } from "../../src/adapters/tandem.js";

describe("TandemAdapter", () => {
  it("sends bearer authentication without exposing the token in results", async () => {
    let authorization = "";
    const fetchImpl: typeof fetch = async (_input, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({ tabs: [], groups: [] });
    };
    const adapter = new TandemAdapter({
      tokenProvider: async () => "secret-token",
      fetch: fetchImpl,
    });

    const result = await adapter.tabs();

    expect(authorization).toBe("Bearer secret-token");
    expect(result).toEqual({ tabs: [], groups: [] });
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("uses Tandem's semantic snapshot routes and tab header", async () => {
    let request: { url: string; method: string; tabId: string | null } | undefined;
    const adapter = new TandemAdapter({
      tokenProvider: async () => "token",
      fetch: async (input, init) => {
        request = {
          url: String(input),
          method: init?.method ?? "GET",
          tabId: new Headers(init?.headers).get("x-tab-id"),
        };
        return Response.json({ ok: true, snapshot: "button @e1", count: 1, url: "https://example.com" });
      },
    });

    await adapter.snapshot("tab-7");

    expect(request).toEqual({
      url: "http://127.0.0.1:8765/snapshot?interactive=true&compact=true",
      method: "GET",
      tabId: "tab-7",
    });
  });

  it("normalizes authentication failures", async () => {
    const adapter = new TandemAdapter({
      tokenProvider: async () => "token",
      fetch: async () => Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    await expect(adapter.tabs()).rejects.toEqual(
      expect.objectContaining<Partial<BridgeError>>({ code: "AUTH_FAILED", retryable: false }),
    );
  });
});
