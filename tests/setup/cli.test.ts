import { spawnSync } from "node:child_process";

import { expect, it } from "vitest";

it("runs doctor without requiring a tsx IPC socket", () => {
  const result = spawnSync("npm", ["run", "doctor"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
  });
  const output = `${result.stdout}${result.stderr}`;

  expect(output).toContain("Frobb Bridge readiness");
  expect(output).not.toContain("createIpcServer");
});
