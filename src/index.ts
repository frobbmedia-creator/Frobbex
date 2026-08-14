import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { CuaAdapter } from "./adapters/cua.js";
import { TandemAdapter } from "./adapters/tandem.js";
import { assertLoopbackHost, createHttpApp } from "./server/app.js";

export function startBridge(): ReturnType<typeof createServer> {
  const host = "127.0.0.1";
  const port = Number.parseInt(process.env.FROBB_BRIDGE_PORT ?? "8790", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("FROBB_BRIDGE_PORT must be a valid TCP port");
  assertLoopbackHost(host);
  const server = createServer(createHttpApp({ tandem: new TandemAdapter(), cua: new CuaAdapter() }));
  return server.listen(port, host, () => process.stderr.write(`Frobb Bridge listening on http://${host}:${port}/mcp\n`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startBridge();
