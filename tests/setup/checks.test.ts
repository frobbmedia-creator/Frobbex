import { describe, expect, it } from "vitest";

import { runChecks, type CheckDependencies } from "../../src/setup/checks.js";

describe("setup checks", () => {
  it("reports every prerequisite in one pass", async () => {
    const dependencies = createDependencies({
      chromeRuntime: false,
      cuaBinary: false,
      accessibility: false,
      screenRecording: false,
    });

    const report = await runChecks(dependencies);

    expect(report.ready).toBe(false);
    expect(report.checks.map((check) => check.id)).toEqual([
      "node",
      "chrome-executable",
      "chrome-profile",
      "chrome-runtime",
      "cua-binary",
      "cua-daemon",
      "accessibility",
      "screen-recording",
      "port",
      "secure-tunnel",
    ]);
  });

  it("does not let the optional tunnel check block local readiness", async () => {
    const report = await runChecks(createDependencies({ secureTunnel: false }));

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "secure-tunnel")).toMatchObject({
      ok: false,
      required: false,
    });
  });
});

function createDependencies(overrides: Partial<Record<keyof CheckDependencies, boolean>> = {}): CheckDependencies {
  const value = (key: keyof CheckDependencies) => async () => overrides[key] ?? true;
  return {
    node: value("node"),
    chromeExecutable: value("chromeExecutable"),
    chromeProfile: value("chromeProfile"),
    chromeRuntime: value("chromeRuntime"),
    cuaBinary: value("cuaBinary"),
    cuaDaemon: value("cuaDaemon"),
    accessibility: value("accessibility"),
    screenRecording: value("screenRecording"),
    port: value("port"),
    secureTunnel: value("secureTunnel"),
  };
}
