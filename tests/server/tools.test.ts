import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { createBridgeServer, type BridgeServices } from "../../src/server/app.js";

const EXPECTED_TOOL_NAMES = [
  "frobb_health",
  "browser_tabs",
  "browser_open",
  "browser_observe",
  "browser_click",
  "browser_type",
  "browser_scroll",
  "computer_apps",
  "computer_windows",
  "computer_launch",
  "computer_observe",
  "computer_click",
  "computer_type",
  "computer_scroll",
  "prepare_action",
  "execute_action",
];

const connected: Array<{ client: Client; closeServer: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(connected.splice(0).map(async ({ client, closeServer }) => {
    await client.close();
    await closeServer();
  }));
});

describe("Frobb MCP tools", () => {
  it("advertises the focused tool set with safety annotations", async () => {
    const client = await connect(createFakeServices());

    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_TOOL_NAMES.sort());
    expect(tools.tools.find((tool) => tool.name === "browser_observe")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.tools.find((tool) => tool.name === "execute_action")?.annotations?.destructiveHint).toBe(true);
  });

  it("returns model-readable and structured browser tab results", async () => {
    const client = await connect(createFakeServices());

    const result = await client.callTool({ name: "browser_tabs", arguments: {} });

    expect(result.structuredContent).toEqual({ tabs: [{ id: "tab-1", title: "Frobb" }], groups: [] });
    expect(result.content).toEqual([{ type: "text", text: "Found 1 Tandem tab." }]);
  });

  it("rejects arbitrary fields before reaching a browser action", async () => {
    const client = await connect(createFakeServices());

    const result = await client.callTool({
      name: "browser_open",
      arguments: { url: "https://example.com", command: "arbitrary" },
    });

    expect(result.isError).toBe(true);
  });
});

async function connect(services: BridgeServices): Promise<Client> {
  const server = createBridgeServer(services);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "frobb-test", version: "1.0.0" });
  await client.connect(clientTransport);
  connected.push({ client, closeServer: () => server.close() });
  return client;
}

function createFakeServices(): BridgeServices {
  return {
    tandem: {
      health: async () => ({ ready: true }),
      tabs: async () => ({ tabs: [{ id: "tab-1", title: "Frobb" }], groups: [] }),
      open: async () => ({ ok: true, tab: { id: "tab-2" } }),
      snapshot: async () => ({ ok: true, snapshot: "button @e1", count: 1, url: "https://example.com" }),
      click: async () => ({ ok: true }),
      type: async () => ({ ok: true }),
      scroll: async () => ({ ok: true, scroll: { scrollTop: 10 } }),
    },
    cua: {
      status: async () => ({ running: true }),
      permissions: async () => ({ accessibility: true, screen_recording: true }),
      listApps: async () => ({ apps: [{ pid: 42, name: "Finder" }] }),
      listWindows: async () => ({ windows: [{ window_id: 7, title: "Finder" }] }),
      call: async () => ({ ok: true }),
      observe: async () => ({ tree_markdown: "window", has_screenshot: true }),
    },
  };
}
