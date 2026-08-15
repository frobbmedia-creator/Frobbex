import { access, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

import { CuaAdapter } from "../adapters/cua.js";
import { loadConfig } from "./config.js";

export interface CheckDependencies {
  node(): Promise<boolean>;
  chromeExecutable(): Promise<boolean>;
  chromeProfile(): Promise<boolean>;
  chromeRuntime(): Promise<boolean>;
  cuaBinary(): Promise<boolean>;
  cuaDaemon(): Promise<boolean>;
  accessibility(): Promise<boolean>;
  screenRecording(): Promise<boolean>;
  port(): Promise<boolean>;
  secureTunnel(): Promise<boolean>;
}

export interface ReadinessCheck {
  id: string;
  label: string;
  ok: boolean;
  required: boolean;
  remediation: string;
}

export interface ReadinessReport {
  ready: boolean;
  checks: ReadinessCheck[];
}

const DEFINITIONS: Array<{
  id: string;
  key: keyof CheckDependencies;
  label: string;
  required: boolean;
  remediation: string;
}> = [
  { id: "node", key: "node", label: "Node.js 22+", required: true, remediation: "Install Node.js 22 or newer." },
  { id: "chrome-executable", key: "chromeExecutable", label: "Google Chrome executable", required: true, remediation: "Install Google Chrome in /Applications or update chromeExecutable in ~/.frobb/bridge.json." },
  { id: "chrome-profile", key: "chromeProfile", label: "Dedicated Frobb Chrome profile", required: true, remediation: "Run npm run setup to create a safe profile configuration under ~/.frobb." },
  { id: "chrome-runtime", key: "chromeRuntime", label: "Dedicated Chrome debugging endpoint", required: false, remediation: "Start Frobb Bridge; it will launch or reconnect to the dedicated Frobb Chrome profile." },
  { id: "cua-binary", key: "cuaBinary", label: "Cua Driver binary", required: true, remediation: "Install Cua Driver using the installer in /Users/frobbclaw/cua/libs/cua-driver/scripts/install-local.sh." },
  { id: "cua-daemon", key: "cuaDaemon", label: "Cua Driver daemon", required: true, remediation: "Start CuaDriver.app in background serve mode, then run cua-driver status." },
  { id: "accessibility", key: "accessibility", label: "Accessibility permission", required: true, remediation: "Grant Accessibility to CuaDriver.app in System Settings → Privacy & Security." },
  { id: "screen-recording", key: "screenRecording", label: "Screen Recording permission", required: true, remediation: "Grant Screen Recording to CuaDriver.app in System Settings → Privacy & Security." },
  { id: "port", key: "port", label: "Bridge port 8790", required: true, remediation: "Stop the process using port 8790 or set FROBB_BRIDGE_PORT to a free port." },
  { id: "secure-tunnel", key: "secureTunnel", label: "OpenAI Secure MCP Tunnel", required: false, remediation: "Install tunnel-client from OpenAI Platform tunnel settings before connecting ChatGPT." },
];

export async function runChecks(dependencies: CheckDependencies = createSystemDependencies()): Promise<ReadinessReport> {
  const checks = await Promise.all(DEFINITIONS.map(async (definition): Promise<ReadinessCheck> => {
    let ok = false;
    try {
      ok = await dependencies[definition.key]();
    } catch {
      ok = false;
    }
    return { id: definition.id, label: definition.label, ok, required: definition.required, remediation: definition.remediation };
  }));
  return { ready: checks.every((check) => !check.required || check.ok), checks };
}

export function createSystemDependencies(): CheckDependencies {
  const cua = new CuaAdapter();
  const config = loadConfig();
  let permissionResult: Promise<Record<string, unknown>> | undefined;
  const permissions = () => permissionResult ??= cua.permissions();
  return {
    node: async () => Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) >= 22,
    chromeExecutable: async () => { const value = await config; await access(value.chromeExecutable); return true; },
    chromeProfile: async () => { const value = await config; return value.chromeProfile.startsWith(join(homedir(), ".frobb") + "/"); },
    chromeRuntime: async () => {
      const value = await config;
      const [line] = (await readFile(join(value.chromeProfile, "DevToolsActivePort"), "utf8")).split(/\r?\n/);
      const port = Number(line);
      if (!Number.isInteger(port)) return false;
      return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1_000) })).ok;
    },
    cuaBinary: async () => findExecutable("cua-driver"),
    cuaDaemon: async () => Boolean(await cua.status()),
    accessibility: async () => (await permissions()).accessibility === true,
    screenRecording: async () => (await permissions()).screen_recording === true,
    port: async () => {
      const value = await config;
      const port = Number.parseInt(process.env.FROBB_BRIDGE_PORT ?? String(value.port), 10);
      if (await portIsAvailable(port)) return true;
      try { const response = await fetch(`http://${value.host}:${port}/health`, { signal: AbortSignal.timeout(1_000) }); return response.ok && (await response.json() as Record<string, unknown>).bridge === true; }
      catch { return false; }
    },
    secureTunnel: async () => findExecutable("tunnel-client"),
  };
}

async function findExecutable(name: string): Promise<boolean> {
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    try {
      await access(join(directory, name));
      return true;
    } catch {
      // Continue through PATH.
    }
  }
  return false;
}

async function portIsAvailable(port: number): Promise<boolean> {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return false;
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}
