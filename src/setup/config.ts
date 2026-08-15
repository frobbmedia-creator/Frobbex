import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

export interface BridgeConfig {
  host: "127.0.0.1" | "::1";
  port: number;
  chromeExecutable: string;
  chromeProfile: string;
}

const DEFAULT_EXECUTABLE = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export function defaultConfig(frobbRoot = join(homedir(), ".frobb")): BridgeConfig {
  return { host: "127.0.0.1", port: 8790, chromeExecutable: DEFAULT_EXECUTABLE, chromeProfile: join(frobbRoot, "chrome-profile") };
}

export async function loadConfig(options: { path?: string; frobbRoot?: string } = {}): Promise<BridgeConfig> {
  const frobbRoot = resolve(options.frobbRoot ?? join(homedir(), ".frobb"));
  const path = options.path ?? join(frobbRoot, "bridge.json");
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaultConfig(frobbRoot);
    throw new Error("Invalid Frobb bridge config");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid Frobb bridge config");
  const value = parsed as Record<string, unknown>;
  const allowed = new Set(["host", "port", "chromeExecutable", "chromeProfile"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("Invalid Frobb bridge config: unknown field");
  const host = value.host;
  const port = value.port;
  const chromeExecutable = value.chromeExecutable;
  const chromeProfile = value.chromeProfile;
  const profilePath = typeof chromeProfile === "string" ? resolve(chromeProfile) : "";
  const insideRoot = relative(frobbRoot, profilePath);
  if ((host !== "127.0.0.1" && host !== "::1") || !Number.isInteger(port) || Number(port) < 1 || Number(port) > 65_535 ||
      typeof chromeExecutable !== "string" || !isAbsolute(chromeExecutable) || typeof chromeProfile !== "string" || !isAbsolute(chromeProfile) ||
      insideRoot === "" || insideRoot.startsWith("..") || isAbsolute(insideRoot)) {
    throw new Error("Invalid Frobb bridge config");
  }
  return { host, port: Number(port), chromeExecutable, chromeProfile: profilePath };
}

export async function writeDefaultConfig(): Promise<string> {
  const directory = join(homedir(), ".frobb");
  const path = join(directory, "bridge.json");
  const temporary = `${path}.tmp-${process.pid}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(temporary, `${JSON.stringify(defaultConfig(directory), null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
  return path;
}
