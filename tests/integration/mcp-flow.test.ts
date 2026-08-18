import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";

import { AuditLogger, ConfirmationStore, ObservationStore } from "../../src/core/index.js";
import { createBridgeServer, type BridgeServices } from "../../src/server/app.js";

it("observes, acts, and verifies a browser change through MCP", async () => {
  let snapshot = "button Publish @e1";
  const services = createServices({
    snapshot: async () => ({ ok: true, snapshot, count: 1, url: "https://example.com" }),
    click: async () => {
      snapshot = "status Published";
      return { ok: true };
    },
  });
  const policy = {
    observations: new ObservationStore(),
    confirmations: new ConfirmationStore(),
    audit: new AuditLogger(() => undefined),
  };
  const server = createBridgeServer(services, policy);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "flow-test", version: "1.0.0" });
  await client.connect(clientTransport);

  try {
    const observed = await client.callTool({ name: "browser_observe", arguments: {} });
    const content = observed.structuredContent as { observation: { id: string } };
    const acted = await client.callTool({
      name: "browser_click",
      arguments: { observationId: content.observation.id, ref: "@e1" },
    });

    expect(acted.structuredContent).toMatchObject({
      verified: true,
      verification: { snapshot: "status Published" },
    });
  } finally {
    await client.close();
    await server.close();
  }
});

function createServices(browserOverrides: Partial<BridgeServices["browser"]>): BridgeServices {
  return {
    browser: {
      health: async () => ({ ready: true }),
      tabs: async () => ({ tabs: [], groups: [] }),
      open: async () => ({ ok: true }),
      snapshot: async () => ({ ok: true, snapshot: "", count: 0, url: "about:blank" }),
      click: async () => ({ ok: true }),
      type: async () => ({ ok: true }),
      scroll: async () => ({ ok: true }),
      ...browserOverrides,
    },
    cua: {
      status: async () => ({ running: true }),
      permissions: async () => ({ accessibility: true, screen_recording: true }),
      listApps: async () => ({ apps: [] }),
      listWindows: async () => ({ windows: [] }),
      call: async () => ({ ok: true }),
      observe: async () => ({ tree_markdown: "", has_screenshot: false }),
    },
  };
}
