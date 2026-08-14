import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export async function writeDefaultConfig(): Promise<string> {
  const directory = join(homedir(), ".frobb");
  const path = join(directory, "bridge.json");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify({ host: "127.0.0.1", port: 8790, tandemUrl: "http://127.0.0.1:8765" }, null, 2)}\n`, { mode: 0o600 });
  return path;
}
