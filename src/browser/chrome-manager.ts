import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { BridgeError } from "../core/index.js";
import type { BridgeConfig } from "../setup/config.js";

export class ChromeManager {
  private child: ChildProcess | undefined;
  private endpoint: { port: number; browserPath: string } | undefined;

  constructor(private readonly config: BridgeConfig, private readonly startupTimeoutMs = 15_000) {}

  async endpointUrl(): Promise<string> {
    const endpoint = await this.ensureRunning();
    return `http://127.0.0.1:${endpoint.port}`;
  }

  async ensureRunning(): Promise<{ port: number; browserPath: string }> {
    if (this.endpoint && await endpointHealthy(this.endpoint.port)) return this.endpoint;
    const active = await this.readActivePort();
    if (active && await endpointHealthy(active.port)) {
      this.endpoint = active;
      return active;
    }
    await mkdir(this.config.chromeProfile, { recursive: true, mode: 0o700 });
    await rm(join(this.config.chromeProfile, "DevToolsActivePort"), { force: true });
    this.child = spawn(this.config.chromeExecutable, [
      `--user-data-dir=${this.config.chromeProfile}`,
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "about:blank",
    ], { shell: false, stdio: "ignore" });
    this.child.once("error", () => { this.endpoint = undefined; });
    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      const value = await this.readActivePort();
      if (value && await endpointHealthy(value.port)) {
        this.endpoint = value;
        return value;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.child.kill("SIGTERM");
    throw new BridgeError("BACKEND_OFFLINE", "Dedicated Frobb Chrome did not start in time");
  }

  invalidate(): void { this.endpoint = undefined; }

  async close(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    this.endpoint = undefined;
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3_000);
      child.once("close", () => { clearTimeout(timer); resolve(); });
    });
  }

  private async readActivePort(): Promise<{ port: number; browserPath: string } | undefined> {
    try {
      const [portLine, browserPath] = (await readFile(join(this.config.chromeProfile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/);
      const port = Number(portLine);
      if (!Number.isInteger(port) || port < 1 || port > 65_535 || !browserPath?.startsWith("/devtools/browser/")) return undefined;
      return { port, browserPath };
    } catch { return undefined; }
  }
}

async function endpointHealthy(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch { return false; }
}
