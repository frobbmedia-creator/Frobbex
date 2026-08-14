import { BridgeError } from "../core/index.js";
import { SpawnProcessRunner, type ProcessRunner } from "./process-runner.js";

export type CuaTool =
  | "status"
  | "check_permissions"
  | "list_apps"
  | "list_windows"
  | "launch_app"
  | "get_window_state"
  | "click"
  | "type_text"
  | "scroll"
  | "press_key"
  | "hotkey";

const CUA_TOOLS = new Set<CuaTool>([
  "status",
  "check_permissions",
  "list_apps",
  "list_windows",
  "launch_app",
  "get_window_state",
  "click",
  "type_text",
  "scroll",
  "press_key",
  "hotkey",
]);

interface CuaAdapterOptions {
  runner?: ProcessRunner;
  binary?: string;
  timeoutMs?: number;
}

export { type ProcessRunner } from "./process-runner.js";

export class CuaAdapter {
  private readonly runner: ProcessRunner;
  private readonly binary: string;
  private readonly timeoutMs: number;

  constructor(options: CuaAdapterOptions = {}) {
    this.runner = options.runner ?? new SpawnProcessRunner();
    this.binary = options.binary ?? "cua-driver";
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async call<T>(tool: CuaTool, args: Record<string, unknown>): Promise<T> {
    if (!CUA_TOOLS.has(tool)) {
      throw new BridgeError("INVALID_INPUT", "Cua tool is not permitted");
    }

    const result = await this.runner.run(this.binary, [tool, JSON.stringify(args)], {
      timeoutMs: this.timeoutMs,
    });
    if (result.exitCode !== 0) {
      const permissionFailure = /permission|accessibility|screen recording/i.test(result.stderr);
      throw new BridgeError(
        permissionFailure ? "PERMISSION_REQUIRED" : "BACKEND_OFFLINE",
        permissionFailure ? "Cua Driver permissions are required" : "Cua Driver call failed",
      );
    }

    try {
      const parsed = JSON.parse(result.stdout) as { structuredContent?: T } & T;
      return parsed.structuredContent ?? parsed;
    } catch {
      throw new BridgeError("INTERNAL_ERROR", "Cua Driver returned malformed JSON");
    }
  }

  status(): Promise<Record<string, unknown>> {
    return this.call("status", {});
  }

  permissions(): Promise<Record<string, unknown>> {
    return this.call("check_permissions", { prompt: false });
  }

  listApps(): Promise<{ apps: Array<Record<string, unknown>> }> {
    return this.call("list_apps", {});
  }

  listWindows(pid: number): Promise<{ windows: Array<Record<string, unknown>> }> {
    return this.call("list_windows", { pid });
  }

  observe(pid: number, windowId: number): Promise<Record<string, unknown>> {
    return this.call("get_window_state", { pid, window_id: windowId });
  }
}
