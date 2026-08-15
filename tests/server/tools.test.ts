import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { AuditLogger, ConfirmationStore, ObservationStore } from "../../src/core/index.js";
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
    expect(tools.tools.every((tool) => tool.outputSchema !== undefined)).toBe(true);
  });

  it("returns model-readable and structured browser tab results", async () => {
    const client = await connect(createFakeServices());

    const result = await client.callTool({ name: "browser_tabs", arguments: {} });

    expect(result.structuredContent).toMatchObject({
      ok: true,
      correlationId: expect.any(String),
      tabs: [{ id: "tab-1", title: "Frobb" }],
      groups: [],
    });
    expect(result.content).toEqual([{ type: "text", text: "Found 1 Frobb Chrome tab." }]);
  });

  it("writes one redacted audit event for a tool call", async () => {
    const events: unknown[] = [];
    const policy = {
      observations: new ObservationStore(),
      confirmations: new ConfirmationStore(),
      audit: new AuditLogger((event) => events.push(event)),
    };
    const server = createBridgeServer(createFakeServices(), policy);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "audit-test", version: "1.0.0" });
    await client.connect(clientTransport);
    connected.push({ client, closeServer: () => server.close() });

    await client.callTool({ name: "browser_tabs", arguments: {} });

    expect(events).toEqual([
      expect.objectContaining({
        tool: "browser_tabs",
        targetClass: "browser",
        resultCode: "OK",
        correlationId: expect.any(String),
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain("tab-1");
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
  const policy = {
    observations: new ObservationStore(),
    confirmations: new ConfirmationStore(),
    audit: new AuditLogger(() => undefined),
  };
  const server = createBridgeServer(services, policy);
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
