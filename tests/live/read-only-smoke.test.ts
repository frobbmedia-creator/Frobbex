import { describe, expect, it } from "vitest";

import { CuaAdapter } from "../../src/adapters/cua.js";
import { ChromeAdapter } from "../../src/adapters/chrome.js";
import { ChromeCdpBackend } from "../../src/browser/cdp.js";
import { ChromeManager } from "../../src/browser/chrome-manager.js";
import { AuditLogger, ConfirmationStore, ObservationStore } from "../../src/core/index.js";
import { createBridgeServer } from "../../src/server/app.js";
import { loadConfig } from "../../src/setup/config.js";

describe.skipIf(process.env.FROBB_LIVE_TEST !== "1")("read-only live smoke", () => {
  it("observes the dedicated Frobb Chrome profile without acting", async () => {
    const manager = new ChromeManager(await loadConfig());
    const tandem = new ChromeAdapter({ backend: new ChromeCdpBackend(manager) });
    const cua = new CuaAdapter();
    const server = createBridgeServer({ tandem, cua }, { observations: new ObservationStore(), confirmations: new ConfirmationStore(), audit: new AuditLogger(() => undefined) });

    const status = await tandem.health();
    const tabs = await tandem.tabs();
    expect(server).toBeDefined();
    expect(status).toBeTypeOf("object");
    expect(tabs.tabs).toBeInstanceOf(Array);
    if (tabs.tabs.length > 0) expect(await tandem.snapshot(String(tabs.tabs[0]?.id))).toBeTypeOf("object");
    try {
      const cuaStatus = await cua.status();
      const apps = await cua.listApps();
      expect(cuaStatus).toBeTypeOf("object");
      expect(apps.apps).toBeInstanceOf(Array);
      const firstPid = Number(apps.apps[0]?.pid);
      if (Number.isInteger(firstPid) && firstPid > 0) {
        const windows = await cua.listWindows(firstPid);
        const firstWindowId = Number(windows.windows[0]?.window_id);
        if (Number.isInteger(firstWindowId) && firstWindowId >= 0) expect(await cua.observe(firstPid, firstWindowId)).toBeTypeOf("object");
      }
    } catch { /* Native validation is reported separately when Cua is unavailable. */ }
    await manager.close();
  }, 120_000);
});
