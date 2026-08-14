# Frobb Media ChatGPT Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private ChatGPT plugin backend that gives Frobb Media one reliable, policy-aware interface for Tandem browser actions and Cua Driver macOS actions.

**Architecture:** A loopback-only TypeScript MCP server exposes focused browser and computer tools. Adapters normalize Tandem HTTP and Cua CLI behavior; a coordinator enforces fresh observations, verification, bounded retries, redacted auditing, and explicit confirmation for consequential actions.

**Tech Stack:** Node.js 22+, TypeScript, `@modelcontextprotocol/sdk`, Zod, Vitest, native `fetch`, native `child_process`.

**Spec:** `docs/superpowers/specs/2026-08-14-frobb-media-chatgpt-bridge-design.md`

## Global Constraints

- Bind HTTP only to `127.0.0.1`; the default port is `8790` and the MCP path is `/mcp`.
- Never return or log Tandem tokens, authorization headers, typed text, or screenshot bytes.
- Cua commands are allowlisted; never invoke `open`, AppleScript, `cliclick`, raw global input, or arbitrary shell commands.
- Inspect immediately before acting and verify immediately after acting.
- Read calls retry at most twice; consequential actions never retry automatically.
- Confirmation tokens are in-memory, single-use, action-digest-bound, and expire after five minutes.
- The live smoke suite is read-only and opt-in.

---

### Task 1: Project foundation and normalized contracts

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/core/contracts.ts`
- Create: `src/core/errors.ts`
- Test: `tests/core/contracts.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `Backend`, `ObservationHandle`, `NormalizedErrorCode`, `BridgeError`, `ActionRisk`, and `ActionResult` shared by all later tasks.

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from "vitest";
import { BridgeError, isObservationHandle } from "../../src/core/index.js";

describe("core contracts", () => {
  it("recognizes valid observation handles", () => {
    expect(isObservationHandle({ id: "o1", backend: "tandem", target: "tab:1", createdAt: 1, expiresAt: 2, revision: "r1" })).toBe(true);
  });
  it("serializes stable bridge errors", () => {
    expect(new BridgeError("BACKEND_OFFLINE", "Tandem is offline").toJSON()).toEqual({ code: "BACKEND_OFFLINE", message: "Tandem is offline", retryable: true });
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npm test -- tests/core/contracts.test.ts`
Expected: FAIL because `src/core/index.ts` does not exist.

- [ ] **Step 3: Add the project files and strict contracts**

```ts
export type Backend = "tandem" | "cua";
export type ActionRisk = "observe" | "reversible" | "consequential";
export type NormalizedErrorCode = "BACKEND_OFFLINE" | "PERMISSION_REQUIRED" | "AUTH_FAILED" | "STALE_OBSERVATION" | "TARGET_GONE" | "ACTION_UNVERIFIED" | "CONFIRMATION_REQUIRED" | "INVALID_CONFIRMATION" | "INVALID_INPUT" | "INTERNAL_ERROR";
export interface ObservationHandle { id: string; backend: Backend; target: string; createdAt: number; expiresAt: number; revision: string; }
export interface ActionResult<T = unknown> { ok: boolean; code: "OK" | NormalizedErrorCode; data?: T; message: string; correlationId: string; }
```

Create `src/core/index.ts` as an explicit re-export barrel and implement `BridgeError` with `retryable` true only for `BACKEND_OFFLINE`, `STALE_OBSERVATION`, and `TARGET_GONE`.

- [ ] **Step 4: Run the focused test and typecheck**

Run: `npm test -- tests/core/contracts.test.ts && npm run typecheck`
Expected: PASS and zero TypeScript diagnostics.

- [ ] **Step 5: Commit the foundation**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/core tests/core
git commit -m "feat: establish Frobb bridge contracts"
```

### Task 2: Tandem and Cua adapters

**Files:**
- Create: `src/adapters/tandem.ts`
- Create: `src/adapters/cua.ts`
- Create: `src/adapters/process-runner.ts`
- Test: `tests/adapters/tandem.test.ts`
- Test: `tests/adapters/cua.test.ts`

**Interfaces:**
- Consumes: `BridgeError` and normalized codes from Task 1.
- Produces: `TandemAdapter` methods `health()`, `tabs()`, `open()`, `snapshot()`, `click()`, `type()`, `scroll()`; `CuaAdapter` method `call<T>(tool, args)` and typed convenience methods for the allowlisted tools.

- [ ] **Step 1: Write failing adapter tests**

```ts
it("adds the Tandem token without returning it", async () => {
  const seen: Record<string, string> = {};
  const adapter = new TandemAdapter({ tokenProvider: async () => "secret", fetch: async (_url, init) => { Object.assign(seen, init?.headers); return Response.json({ ok: true }); } });
  expect(await adapter.health()).toEqual({ ok: true });
  expect(seen.Authorization).toBe("Bearer secret");
  expect(JSON.stringify(await adapter.health())).not.toContain("secret");
});

it("rejects non-allowlisted Cua tools", async () => {
  const adapter = new CuaAdapter({ run: vi.fn() });
  await expect(adapter.call("shell" as never, {})).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
```

- [ ] **Step 2: Run adapter tests and verify failure**

Run: `npm test -- tests/adapters`
Expected: FAIL because both adapters are missing.

- [ ] **Step 3: Implement the Tandem adapter**

Use `fetch` with a five-second `AbortSignal.timeout`, read the token for every call from `~/.tandem/api-token`, validate JSON objects, and map connection, 401/403, timeout, and malformed JSON errors to `BridgeError`. Implement exact existing routes: `/status`, `/tabs/list`, `/tabs/open`, `/snapshot`, `/click-ref`, `/type-ref`, and `/scroll` after verifying their request shapes against Tandem source.

- [ ] **Step 4: Implement the Cua adapter and runner**

```ts
const CUA_TOOLS = new Set(["status", "check_permissions", "list_apps", "list_windows", "launch_app", "get_window_state", "click", "type_text", "scroll", "press_key", "hotkey"] as const);

export interface ProcessRunner {
  run(command: string, args: readonly string[], options: { timeoutMs: number }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}
```

Execute `cua-driver <tool> <json>` without a shell, enforce a ten-second timeout, parse the structured JSON, and redact arguments in every thrown message. Map missing binary/daemon to `BACKEND_OFFLINE` and permission failures to `PERMISSION_REQUIRED`.

- [ ] **Step 5: Run adapter tests and commit**

Run: `npm test -- tests/adapters && npm run typecheck`
Expected: PASS.

```bash
git add src/adapters tests/adapters
git commit -m "feat: add Tandem and Cua adapters"
```

### Task 3: Observation, verification, confirmation, retry, and audit policy

**Files:**
- Create: `src/core/observations.ts`
- Create: `src/core/confirmation.ts`
- Create: `src/core/retry.ts`
- Create: `src/core/audit.ts`
- Create: `src/core/coordinator.ts`
- Test: `tests/core/policy.test.ts`
- Test: `tests/core/coordinator.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts and Task 2 adapter interfaces.
- Produces: `ObservationStore.issue/consume`, `ConfirmationStore.prepare/consume`, `withReadRetry`, `AuditLogger.record`, and `ActionCoordinator` methods used by MCP handlers.

- [ ] **Step 1: Write failing policy tests**

```ts
it("binds confirmation to an exact action and permits one use", () => {
  const store = new ConfirmationStore({ now: () => 1_000, secret: Buffer.alloc(32, 7) });
  const prepared = store.prepare({ kind: "browser_click", target: "publish" }, "Publish the post");
  expect(store.consume(prepared.token, { kind: "browser_click", target: "publish" }).summary).toBe("Publish the post");
  expect(() => store.consume(prepared.token, { kind: "browser_click", target: "publish" })).toThrow();
});

it("expires an observation after use", () => {
  const store = new ObservationStore({ now: () => 1_000, ttlMs: 30_000 });
  const handle = store.issue("tandem", "tab:1", "rev");
  expect(store.consume(handle.id, "tandem", "tab:1")).toEqual(handle);
  expect(() => store.consume(handle.id, "tandem", "tab:1")).toThrow();
});
```

- [ ] **Step 2: Run tests and verify missing implementations**

Run: `npm test -- tests/core/policy.test.ts tests/core/coordinator.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement stores and read retries**

Use `crypto.randomUUID()` for IDs and HMAC-SHA256 over canonical JSON for action digests. Store only digest, summary, expiry, and used flag. `withReadRetry` makes at most three total attempts for retryable read failures with injectable `sleep` delays `[50, 150]`; writes bypass it.

- [ ] **Step 4: Implement redacted audit logging and coordinator flows**

`AuditLogger.record` accepts only `{ timestamp, correlationId, tool, targetClass, resultCode, durationMs }`. The coordinator must consume a matching observation before an action, call the backend once, immediately re-observe, compare the backend-specific revision, and return `ACTION_UNVERIFIED` when no expected state evidence exists. Consequential execution consumes confirmation before dispatch and never retries.

- [ ] **Step 5: Run policy/coordinator tests and commit**

Run: `npm test -- tests/core && npm run typecheck`
Expected: PASS.

```bash
git add src/core tests/core
git commit -m "feat: enforce observation and confirmation policy"
```

### Task 4: MCP server and focused Frobb tools

**Files:**
- Create: `src/server/tool-schemas.ts`
- Create: `src/server/register-tools.ts`
- Create: `src/server/app.ts`
- Create: `src/index.ts`
- Test: `tests/server/tools.test.ts`
- Test: `tests/server/http.test.ts`

**Interfaces:**
- Consumes: `ActionCoordinator`, adapters, and policy stores from Tasks 2-3.
- Produces: `createBridgeServer(deps)`, `createHttpApp(deps)`, `/mcp`, `/health`, and the 16 tool names defined by the spec.

- [ ] **Step 1: Write failing MCP metadata tests**

```ts
it("advertises the focused tool set with safety annotations", async () => {
  const tools = await listTools(createTestClient());
  expect(tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_TOOL_NAMES.sort());
  expect(tools.find((tool) => tool.name === "browser_observe")?.annotations?.readOnlyHint).toBe(true);
  expect(tools.find((tool) => tool.name === "execute_action")?.annotations?.destructiveHint).toBe(true);
});
```

- [ ] **Step 2: Run server tests and verify failure**

Run: `npm test -- tests/server`
Expected: FAIL because the MCP app is missing.

- [ ] **Step 3: Define strict schemas and register all tools**

Create separate Zod schemas for each tool. Do not add a generic backend, endpoint, command, or arbitrary argument field. Tool handlers return `{ structuredContent, content: [{ type: "text", text }] }`; errors return normalized codes and correlation IDs without stack traces or secrets.

- [ ] **Step 4: Implement Streamable HTTP and health endpoints**

Use SDK `StreamableHTTPServerTransport` at `/mcp`, reject non-loopback binds in configuration, limit JSON bodies to 1 MiB, and expose a local `/health` response with component booleans and normalized errors. `src/index.ts` reads `FROBB_BRIDGE_PORT` with default `8790` and always binds `127.0.0.1`.

- [ ] **Step 5: Test schemas, initialization, list-tools, calls, and commit**

Run: `npm test -- tests/server && npm run typecheck`
Expected: PASS.

```bash
git add src/server src/index.ts tests/server
git commit -m "feat: expose Frobb tools over MCP"
```

### Task 5: Setup, doctor, local configuration, and operator documentation

**Files:**
- Create: `src/setup/checks.ts`
- Create: `src/setup/cli.ts`
- Create: `src/setup/config.ts`
- Create: `tests/setup/checks.test.ts`
- Create: `README.md`
- Create: `.env.example`

**Interfaces:**
- Consumes: adapter health methods and `BridgeError`.
- Produces: `npm run setup`, `npm run doctor`, `runChecks()`, and connection instructions for Secure MCP Tunnel and ChatGPT developer mode.

- [ ] **Step 1: Write failing readiness-report tests**

```ts
it("reports every prerequisite in one pass", async () => {
  const report = await runChecks(fakeDependencies({ tandem: false, cuaBinary: false, permissions: false }));
  expect(report.ready).toBe(false);
  expect(report.checks.map((check) => check.id)).toEqual(["node", "tandem-token", "tandem-api", "cua-binary", "cua-daemon", "accessibility", "screen-recording", "port", "secure-tunnel"]);
});
```

- [ ] **Step 2: Run setup tests and verify failure**

Run: `npm test -- tests/setup`
Expected: FAIL.

- [ ] **Step 3: Implement non-interactive checks and config**

`runChecks` must not launch, prompt, foreground, install, or modify Tandem/Cua. Store only non-secret preferences in `~/.frobb/bridge.json` using mode `0600`. Print a concise table and exact remediation commands. Exit `0` when ready and `1` otherwise.

- [ ] **Step 4: Write operator documentation**

Document install, `npm run setup`, `npm run dev`, Secure MCP Tunnel, ChatGPT Settings → Security and login → Developer mode, plugin connection using `/mcp`, confirmation behavior, troubleshooting, data handling, and the opt-in live smoke command. Cite the three official OpenAI pages from the spec.

- [ ] **Step 5: Run setup tests and commit**

Run: `npm test -- tests/setup && npm run typecheck`
Expected: PASS.

```bash
git add src/setup tests/setup README.md .env.example package.json
git commit -m "feat: add frictionless setup and doctor workflow"
```

### Task 6: End-to-end verification and release evidence

**Files:**
- Create: `tests/integration/mcp-flow.test.ts`
- Create: `tests/live/read-only-smoke.test.ts`
- Create: `docs/verification.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: the complete bridge and setup CLI.
- Produces: repeatable mocked end-to-end coverage, opt-in read-only live checks, and recorded verification evidence.

- [ ] **Step 1: Write the mocked end-to-end flow**

```ts
it("observes, acts, and verifies through MCP", async () => {
  const client = await startTestBridge({ tandem: fakeTandem() });
  const observed = await client.callTool({ name: "browser_observe", arguments: {} });
  const acted = await client.callTool({ name: "browser_click", arguments: { observationId: observed.structuredContent.observation.id, ref: "@e1" } });
  expect(acted.structuredContent).toMatchObject({ ok: true, verified: true });
});
```

- [ ] **Step 2: Add guarded live smoke tests**

Skip unless `FROBB_LIVE_TEST=1`. Call only MCP initialize/list-tools, Tandem status/tabs, Cua status/list_apps/list_windows/get_window_state. Assert the suite contains no calls to click, type, scroll, launch, hotkey, close, delete, publish, send, or submit.

- [ ] **Step 3: Run the full automated gate**

Run: `npm ci && npm run verify`
Expected: clean install, typecheck PASS, all mocked tests PASS, live tests SKIP when the environment variable is absent.

- [ ] **Step 4: Run local doctor and available read-only smoke checks**

Run: `npm run doctor`
Expected: a complete readiness report. If Tandem and Cua are installed and permitted, run `FROBB_LIVE_TEST=1 npm test -- tests/live/read-only-smoke.test.ts`; otherwise record exact unmet prerequisites without claiming live success.

- [ ] **Step 5: Record evidence and commit**

Write exact commands, dates, pass/fail/skip counts, component versions, and any unmet external prerequisites in `docs/verification.md`.

```bash
git add tests/integration tests/live docs/verification.md package.json
git commit -m "test: verify Frobb bridge end to end"
```
