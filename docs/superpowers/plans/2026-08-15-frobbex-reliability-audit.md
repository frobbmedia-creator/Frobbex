# Frobbex Reliability Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver safe, reliable autonomous control of a dedicated Chrome profile on this Intel Mac while preserving Frobbex's public MCP contract.

**Architecture:** Replace the non-target-safe Tandem adapter with an owned Chrome/CDP adapter, retain the policy/MCP boundary, and harden config, lifecycle, native execution, and readiness checks around the actual runtime.

**Tech Stack:** Node.js 22, TypeScript, MCP SDK, Zod, Vitest, Chrome DevTools Protocol.

**Spec:** `docs/superpowers/specs/2026-08-15-frobbex-reliability-audit-design.md`

## Global Constraints

- Bind network listeners and debugging endpoints to loopback only.
- Control only the dedicated profile under `~/.frobb`.
- Keep existing public MCP tool names and input schemas compatible.
- Never expose arbitrary shell, HTTP, filesystem, JavaScript, or CDP passthrough.
- Never retry a write; always observe before and verify after acting.
- Never log or return tokens, typed secrets, screenshot bytes, or raw command arguments.

### Task 1: Configuration and Chrome ownership

**Files:** `src/setup/config.ts`, `src/browser/chrome-manager.ts`, `tests/setup/config.test.ts`, `tests/browser/chrome-manager.test.ts`

- [ ] Write failing tests for strict loopback/path/port validation and safe defaults.
- [ ] Implement authoritative config loading and atomic permission-safe writes.
- [ ] Write failing tests for owned-process adoption, stale metadata cleanup, bounded startup, and dedicated-profile launch arguments.
- [ ] Implement Chrome lifecycle ownership and verify the focused tests.
- [ ] Run the full verification suite and commit.

### Task 2: Exact-target CDP browser adapter

**Files:** `src/browser/cdp.ts`, `src/adapters/chrome.ts`, `tests/browser/cdp.test.ts`, `tests/adapters/chrome.test.ts`

- [ ] Write failing tests proving exact target selection, ambiguity rejection, fixed-operation-only CDP calls, semantic ref binding, and reconnect reads.
- [ ] Implement a bounded CDP client and fixed DOM observation/click/fill/scroll operations.
- [ ] Ensure writes are never retried and stale/navigation mismatches are normalized.
- [ ] Run focused and full verification, then commit.

### Task 3: Policy and MCP integration hardening

**Files:** `src/core/observations.ts`, `src/core/coordinator.ts`, `src/server/app.ts`, `src/server/register-tools.ts`, `src/server/tool-schemas.ts`, associated tests

- [ ] Write failing tests for target/ref binding, omitted-target ambiguity, exact post-action verification, confirmation consumption timing, and session cleanup.
- [ ] Wire Chrome through the existing browser tool names and schemas.
- [ ] Preserve single-use observations/confirmations and metadata-only auditing.
- [ ] Replace socket-dependent unit tests with request-listener tests where sandbox-safe.
- [ ] Run full verification and commit.

### Task 4: Native process and runtime reliability

**Files:** `src/adapters/process-runner.ts`, `src/adapters/cua.ts`, `src/index.ts`, associated tests

- [ ] Write failing tests for timeout escalation, output bounds, target propagation, startup errors, and graceful bridge shutdown.
- [ ] Implement minimal hardening and error normalization without raw output leakage.
- [ ] Run full verification and commit.

### Task 5: Doctor, cleanup, documentation, and live validation

**Files:** `src/setup/checks.ts`, `src/setup/cli.ts`, `README.md`, `docs/verification.md`, `tests/live/read-only-smoke.test.ts`, setup tests

- [ ] Write failing tests that make doctor use actual config and Chrome ownership probes.
- [ ] Implement doctor/cleanup/restart reporting and repair the live test signature.
- [ ] Update operator documentation with exact safe startup/restart/reconnect behavior.
- [ ] Run `npm run verify`, `npm run build`, `npm run doctor`, and the read-only live test against only the dedicated profile.
- [ ] Review the requirement checklist, inspect the final diff/status, and commit the verified group.
