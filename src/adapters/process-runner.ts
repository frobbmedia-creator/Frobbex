import { spawn } from "node:child_process";

import { BridgeError } from "../core/index.js";

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProcessRunner {
  run(
    command: string,
    args: readonly string[],
    options: { timeoutMs: number },
  ): Promise<ProcessResult>;
}

export class SpawnProcessRunner implements ProcessRunner {
  run(command: string, args: readonly string[], options: { timeoutMs: number }): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 1_000).unref();
      }, options.timeoutMs);

      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        stdout = appendBounded(stdout, chunk);
      });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr = appendBounded(stderr, chunk);
      });
      child.once("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(
          new BridgeError(
            "BACKEND_OFFLINE",
            error.code === "ENOENT" ? "Cua Driver is not installed" : "Cua Driver could not start",
          ),
        );
      });
      child.once("close", (exitCode) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: timedOut ? 124 : exitCode ?? 1 });
      });
    });
  }
}

const MAX_OUTPUT_BYTES = 1_048_576;
function appendBounded(current: string, chunk: string): string {
  if (Buffer.byteLength(current) >= MAX_OUTPUT_BYTES) return current;
  const remaining = MAX_OUTPUT_BYTES - Buffer.byteLength(current);
  return current + Buffer.from(chunk).subarray(0, remaining).toString("utf8");
}
