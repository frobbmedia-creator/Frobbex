import { createServer } from "node:http";
import { once } from "node:events";

import { afterEach, describe, expect, it } from "vitest";

import { assertLoopbackHost, createHttpApp, type BridgeServices } from "../../src/server/app.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    server.close();
    await once(server, "close");
  }));
});

describe("Frobb HTTP app", () => {
  it("serves local component health without secrets", async () => {
    const app = createHttpApp(createServices());
    const server = createServer(app).listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing address");

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ bridge: true, browser: true, cua: true, permissions: true });

    const rejected = await fetch(`http://127.0.0.1:${address.port}/health`, { headers: { Origin: "https://evil.example" } });
    expect(rejected.status).toBe(403);
  });

  it("rejects non-loopback bind hosts", () => {
    expect(() => assertLoopbackHost("0.0.0.0")).toThrowError(/loopback/i);
    expect(() => assertLoopbackHost("127.0.0.1")).not.toThrow();
  });
});

function createServices(): BridgeServices {
  return {
    browser: {
      health: async () => ({ ready: true }),
      tabs: async () => ({ tabs: [], groups: [] }),
      open: async () => ({ ok: true }),
      snapshot: async () => ({ ok: true, snapshot: "", count: 0, url: "about:blank" }),
      click: async () => ({ ok: true }),
      type: async () => ({ ok: true }),
      scroll: async () => ({ ok: true }),
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
