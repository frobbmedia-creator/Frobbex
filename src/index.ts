import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { CuaAdapter } from "./adapters/cua.js";
import { ChromeAdapter } from "./adapters/chrome.js";
import { ChromeCdpBackend } from "./browser/cdp.js";
import { ChromeManager } from "./browser/chrome-manager.js";
import { assertLoopbackHost, createHttpApp } from "./server/app.js";
import { loadConfig } from "./setup/config.js";

export async function startBridge(): Promise<ReturnType<typeof createServer>> {
  const config = await loadConfig();
  const port = process.env.FROBB_BRIDGE_PORT === undefined ? config.port : Number.parseInt(process.env.FROBB_BRIDGE_PORT, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("FROBB_BRIDGE_PORT must be a valid TCP port");
  assertLoopbackHost(config.host);
  const manager = new ChromeManager(config);
  const chrome = new ChromeAdapter({ backend: new ChromeCdpBackend(manager) });
  const server = createServer(createHttpApp({ tandem: chrome, cua: new CuaAdapter() }));
  server.on("close", () => { void manager.close(); });
  return server.listen(port, config.host, () => process.stderr.write(`Frobb Bridge listening on http://${config.host}:${port}/mcp\n`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await startBridge();
