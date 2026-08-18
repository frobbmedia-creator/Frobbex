# Frobb Bridge Verification

**Date:** 2026-08-17  
**Branch:** `main`  
**Focus:** Public-facing Chrome-first surface

## Automated gate

```bash
npm ci
npm run verify
npm run build
```

Expected:

- TypeScript: clean strict typecheck
- Unit + integration tests: pass
- Live smoke: skipped unless `FROBB_LIVE_TEST=1`

## What the suite covers

- MCP discovery of all 16 focused tools
- Read-only / destructive annotations
- Unknown tool input rejected before backend dispatch
- `browser_observe` → `browser_click` → post-action verification through MCP
- `/health` on a real loopback listener; non-loopback bind rejected
- Chrome adapter target resolution and operation shapes
- Cua adapter command allowlist and secret-safe errors
- Single-use observations, action-bound confirmations, read retry cap, redacted audit events
- Doctor readiness reporting without prompting or foregrounding apps

## Live smoke

```bash
FROBB_LIVE_TEST=1 npm test -- tests/live/read-only-smoke.test.ts
```

Read-only only. Lists and observes the dedicated Frobb Chrome profile under `~/.frobb/chrome-profile`. Does not click, type, scroll, launch, focus, close, send, submit, publish, or delete.

Native Cua checks run when the driver is installed and permitted; otherwise they are reported separately without failing the browser half.

## Operator checks

```bash
npm run doctor
```

Reports Node, Chrome executable/profile, debugging endpoint, Cua binary/daemon, Accessibility, Screen Recording, bridge port, and optional tunnel-client in one pass.
