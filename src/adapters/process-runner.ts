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
      const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs);

      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr += chunk;
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
        resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
      });
    });
  }
}
