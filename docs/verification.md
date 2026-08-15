# Frobb Bridge Verification

**Date:** 2026-08-15
**Branch:** `main`
**Node:** `v22.22.1`
**npm:** `10.9.4`

## Automated gate

Command:

```bash
npm ci
npm run verify
npm run build
```

Result:

- dependency audit: 146 packages installed, 0 reported vulnerabilities
- TypeScript: clean strict typecheck
- tests: 25 passed, 0 failed, 1 skipped
- test files: 10 passed, 0 failed, 1 skipped
- build: passed

The live test is guarded by `FROBB_LIVE_TEST=1`; current evidence is recorded again after the reliability audit rather than relying on the older MVP run below.

## Coverage evidence

- MCP discovery: all 16 focused tools listed through a real in-memory MCP client/server transport.
- MCP metadata: every tool has an output schema; read-only and destructive annotations asserted.
- MCP validation: unknown tool input rejected before backend dispatch.
- Browser workflow: a complete `browser_observe` → `browser_click` → post-action verification flow passed through MCP.
- HTTP: `/health` served from a real temporary loopback listener; non-loopback bind rejected.
- Tandem adapter: bearer authentication, exact semantic endpoint shapes, and auth error normalization passed.
- Cua adapter: command allowlist, shell-free invocation, structured result parsing, and secret-safe error behavior passed.
- Policy: single-use observations, action-bound single-use confirmations, mismatch rejection, read retry cap, redacted auditing, and unverified-action failure passed.
- Operability: successful MCP results include correlation IDs, failures normalize codes, and each handled tool call emits one metadata-only audit event.
- Setup: consolidated readiness reporting and optional tunnel behavior passed.
- CLI regression: `npm run doctor` executes without the `tsx` CLI IPC socket and reaches Frobb readiness checks.

## Real Mac doctor

Command executed with real loopback access:

```bash
npm run doctor
```

Observed results:

| Check | Result |
|---|---|
| Node.js 22+ | PASS |
| Tandem API token | PASS |
| Tandem local API | FAIL — Tandem is not running |
| Cua Driver binary | FAIL — not installed on PATH |
| Cua Driver daemon | FAIL — binary/daemon unavailable |
| Accessibility permission | FAIL — cannot validate until Cua Driver is installed |
| Screen Recording permission | FAIL — cannot validate until Cua Driver is installed |
| Bridge port 8790 | PASS |
| OpenAI Secure MCP Tunnel | OPTIONAL — `tunnel-client` not installed |

The doctor exited `1`, correctly reflecting unmet required runtime prerequisites. No app was foregrounded, no permission dialog was triggered, and no native or browser action was performed.

## Live test gate

After starting Tandem, installing/starting Cua Driver, and granting its two macOS permissions, run:

```bash
npm run doctor
FROBB_LIVE_TEST=1 npm test -- tests/live/read-only-smoke.test.ts
```

The live suite contains only MCP construction, Tandem status/tab reads, Cua status/app/window reads, and an optional window observation. It does not click, type, scroll, launch, focus, close, send, submit, publish, delete, or mutate user state.
