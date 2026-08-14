import { describe, expect, it } from "vitest";

import { CuaAdapter, type ProcessRunner } from "../../src/adapters/cua.js";

describe("CuaAdapter", () => {
  it("rejects commands outside the focus-safe allowlist", async () => {
    const runner: ProcessRunner = {
      run: async () => ({ stdout: "{}", stderr: "", exitCode: 0 }),
    };
    const adapter = new CuaAdapter({ runner });

    await expect(adapter.call("shell" as never, {})).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("executes an allowlisted tool without a shell and parses structured content", async () => {
    let invocation: { command: string; args: readonly string[]; timeoutMs: number } | undefined;
    const runner: ProcessRunner = {
      run: async (command, args, options) => {
        invocation = { command, args, timeoutMs: options.timeoutMs };
        return {
          stdout: JSON.stringify({ structuredContent: { apps: [{ pid: 42, name: "Finder" }] } }),
          stderr: "",
          exitCode: 0,
        };
      },
    };
    const adapter = new CuaAdapter({ runner });

    const result = await adapter.call<{ apps: Array<{ pid: number; name: string }> }>("list_apps", {});

    expect(invocation).toEqual({
      command: "cua-driver",
      args: ["list_apps", "{}"],
      timeoutMs: 10_000,
    });
    expect(result).toEqual({ apps: [{ pid: 42, name: "Finder" }] });
  });

  it("does not leak arguments when a Cua call fails", async () => {
    const runner: ProcessRunner = {
      run: async () => ({ stdout: "", stderr: "failed on super-secret", exitCode: 1 }),
    };
    const adapter = new CuaAdapter({ runner });

    const error = await adapter.call("type_text", { pid: 42, text: "super-secret" }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "BACKEND_OFFLINE" });
    expect(String(error)).not.toContain("super-secret");
  });
});
