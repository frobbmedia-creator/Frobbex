import { describe, expect, it } from "vitest";

import { CuaAdapter } from "../../src/adapters/cua.js";
import { TandemAdapter } from "../../src/adapters/tandem.js";
import { createBridgeServer } from "../../src/server/app.js";

describe.skipIf(process.env.FROBB_LIVE_TEST !== "1")("read-only live smoke", () => {
  it("initializes the MCP server and reaches Tandem and Cua without acting", async () => {
    const tandem = new TandemAdapter();
    const cua = new CuaAdapter();
    const server = createBridgeServer({ tandem, cua });

    const status = await tandem.health();
    const tabs = await tandem.tabs();
    const cuaStatus = await cua.status();
    const apps = await cua.listApps();

    expect(server).toBeDefined();
    expect(status).toBeTypeOf("object");
    expect(tabs.tabs).toBeInstanceOf(Array);
    expect(cuaStatus).toBeTypeOf("object");
    expect(apps.apps).toBeInstanceOf(Array);

    const firstPid = Number(apps.apps[0]?.pid);
    if (Number.isInteger(firstPid) && firstPid > 0) {
      const windows = await cua.listWindows(firstPid);
      const firstWindowId = Number(windows.windows[0]?.window_id);
      if (Number.isInteger(firstWindowId) && firstWindowId >= 0) {
        expect(await cua.observe(firstPid, firstWindowId)).toBeTypeOf("object");
      }
    }
  });
});
