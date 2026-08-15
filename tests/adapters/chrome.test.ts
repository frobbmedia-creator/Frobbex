import { describe, expect, it } from "vitest";

import { ChromeAdapter, type ChromeBackend } from "../../src/adapters/chrome.js";

describe("ChromeAdapter", () => {
  it("routes observation and action to the exact target", async () => {
    const calls: Array<{ targetId: string; operation: string }> = [];
    const backend: ChromeBackend = {
      health: async () => ({ ready: true }),
      tabs: async () => [{ id: "tab-a", title: "A", url: "https://a.example" }, { id: "tab-b", title: "B", url: "https://b.example" }],
      open: async () => ({ id: "tab-c" }),
      operate: async (targetId, operation) => {
        calls.push({ targetId, operation: operation.kind });
        if (operation.kind === "observe") return { url: "https://b.example", title: "B", documentId: "doc-1", snapshot: "button Save @e1", refs: { "@e1": "node-1" } };
        return { ok: true };
      },
    };
    const adapter = new ChromeAdapter({ backend });

    await adapter.snapshot("tab-b");
    await adapter.click("tab-b", "@e1", true);

    expect(calls).toEqual([
      { targetId: "tab-b", operation: "observe" },
      { targetId: "tab-b", operation: "click" },
    ]);
    expect((await backend.tabs()).length).toBe(2);
  });

  it("rejects an omitted target when more than one page exists", async () => {
    const backend: ChromeBackend = {
      health: async () => ({ ready: true }),
      tabs: async () => [{ id: "a", title: "A", url: "https://a" }, { id: "b", title: "B", url: "https://b" }],
      open: async () => ({ id: "c" }),
      operate: async () => ({}),
    };
    const adapter = new ChromeAdapter({ backend });

    await expect(adapter.snapshot()).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
