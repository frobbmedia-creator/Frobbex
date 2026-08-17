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
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: CuaAdapterOptions = {}) {
    this.runner = options.runner ?? new SpawnProcessRunner();
    this.binary = options.binary ?? "cua-driver";
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private enqueue<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    // The cua-driver CLI races on its socket when invoked concurrently
    // (including across processes, e.g. doctor while the bridge is live);
    // serialize through a single queue and retry on transient failure.
    const run = async (left: number): Promise<T> => {
      try {
        return await fn();
      } catch (error) {
        if (left <= 1 || !(error instanceof BridgeError) || error.code !== "BACKEND_OFFLINE") throw error;
        await new Promise((resolve) => setTimeout(resolve, 800));
        return run(left - 1);
      }
    };
    const result = this.queue.then(() => run(attempts), () => run(attempts));
    this.queue = result.catch(() => undefined);
    return result;
  }

  async call<T>(tool: CuaTool, args: Record<string, unknown>): Promise<T> {
    if (!CUA_TOOLS.has(tool)) {
      throw new BridgeError("INVALID_INPUT", "Cua tool is not permitted");
    }

    return this.enqueue(async () => {
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
    });
  }

  async status(): Promise<Record<string, unknown>> {
    // The nightly cua-driver CLI prints human-readable status text for `status`,
    // not JSON. Treat "daemon is running" as a healthy signal.
    return this.enqueue(async () => {
      const result = await this.runner.run(this.binary, ["status", JSON.stringify({})], {
        timeoutMs: this.timeoutMs,
      });
      if (result.exitCode !== 0) {
        throw new BridgeError("BACKEND_OFFLINE", "Cua Driver call failed");
      }
      try {
        const parsed = JSON.parse(result.stdout) as { structuredContent?: Record<string, unknown> } & Record<string, unknown>;
        return parsed.structuredContent ?? parsed;
      } catch {
        if (/daemon is running/i.test(result.stdout)) return { daemon: true };
        throw new BridgeError("INTERNAL_ERROR", "Cua Driver returned malformed JSON");
      }
    });
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
