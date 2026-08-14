import { access, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

import { CuaAdapter } from "../adapters/cua.js";
import { TandemAdapter } from "../adapters/tandem.js";

export interface CheckDependencies {
  node(): Promise<boolean>;
  tandemToken(): Promise<boolean>;
  tandemApi(): Promise<boolean>;
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
  { id: "tandem-token", key: "tandemToken", label: "Tandem API token", required: true, remediation: "Start Tandem once so ~/.tandem/api-token is created." },
  { id: "tandem-api", key: "tandemApi", label: "Tandem local API", required: true, remediation: "Start Tandem Browser and verify http://127.0.0.1:8765/status." },
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
  const tandem = new TandemAdapter();
  const cua = new CuaAdapter();
  let permissionResult: Promise<Record<string, unknown>> | undefined;
  const permissions = () => permissionResult ??= cua.permissions();
  return {
    node: async () => Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) >= 22,
    tandemToken: async () => (await readFile(join(homedir(), ".tandem", "api-token"), "utf8")).trim().length > 0,
    tandemApi: async () => Boolean(await tandem.health()),
    cuaBinary: async () => findExecutable("cua-driver"),
    cuaDaemon: async () => Boolean(await cua.status()),
    accessibility: async () => (await permissions()).accessibility === true,
    screenRecording: async () => (await permissions()).screen_recording === true,
    port: async () => portIsAvailable(Number.parseInt(process.env.FROBB_BRIDGE_PORT ?? "8790", 10)),
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
