import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/setup/config.js";

describe("bridge config", () => {
  it("loads a dedicated loopback Chrome configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "frobb-config-"));
    const path = join(root, "bridge.json");
    await writeFile(path, JSON.stringify({
      host: "127.0.0.1",
      port: 8790,
      chromeExecutable: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      chromeProfile: join(root, "chrome-profile"),
    }));

    await expect(loadConfig({ path, frobbRoot: root })).resolves.toMatchObject({
      host: "127.0.0.1",
      port: 8790,
      chromeProfile: join(root, "chrome-profile"),
    });
  });

  it("rejects remote hosts, unknown fields, and profiles outside the Frobb root", async () => {
    const root = await mkdtemp(join(tmpdir(), "frobb-config-"));
    const path = join(root, "bridge.json");
    await writeFile(path, JSON.stringify({ host: "0.0.0.0", port: 8790, chromeExecutable: "/Chrome", chromeProfile: "/tmp/profile", token: "secret" }));

    await expect(loadConfig({ path, frobbRoot: root })).rejects.toThrow(/config/i);
  });
});
