# Frobbex Reliability Audit Design

## Objective

Make Frobbex a reliable, localhost-only MCP bridge that owns and controls only a dedicated Google Chrome profile on this Intel Mac, while preserving the existing public tool names and safety policy.

## Findings and required corrections

- Replace the unused Tandem dependency with direct Chrome DevTools Protocol control of the configured dedicated profile.
- Bind every observation and action to an exact Chrome target ID. Bind element actions to semantic references issued by that target's latest observation.
- Reject stale, closed, navigated, or mismatched targets before action; never fall back to the active tab.
- Verify actions by re-observing the same target. Do not replay writes after reconnects or stale observations.
- Own Chrome explicitly: validated executable/profile paths, loopback remote debugging, PID/metadata tracking, existing-owned-process adoption, bounded startup, graceful shutdown, stale-state cleanup, and reconnect after browser restarts.
- Keep the bridge bound to loopback and reject non-loopback backend/config URLs.
- Preserve observe-before-act, verify-after-act, single-use observations, exact-action confirmations, metadata-only audit logs, strict input schemas, and the absence of arbitrary shell/HTTP/filesystem/JavaScript tools.
- Harden process execution with bounded output and deterministic timeout termination.
- Make configuration authoritative, validated, permission-safe, and non-secret.
- Make doctor checks describe the actual Chrome runtime, profile ownership, bridge port state, Cua availability, architecture, and optional tunnel state.
- Keep native Mac tools, but ensure actions are tied to the observed PID/window and that coordinate/element addressing is unambiguous.
- Repair build and tests; add lifecycle, targeting, reconnect, config, and security regressions.

## Architecture

`ChromeManager` is the sole owner of the dedicated browser runtime. It launches Google Chrome with a dedicated `--user-data-dir`, a loopback DevTools endpoint, and conservative first-run/background flags. Runtime metadata under `~/.frobb/run` records only process identity and debugging location. The manager adopts only a process whose executable, profile, and start identity match; otherwise stale metadata is discarded. It never attaches to the user's normal Chrome profile.

`ChromeAdapter` exposes the existing browser service interface. It lists page targets and creates a short-lived CDP session to the exact target for each operation. Observation executes a fixed, embedded DOM inspection function that emits semantic refs and a document revision. Click, fill, and scroll execute fixed operations only; callers cannot provide JavaScript. Each request reconnects safely if Chrome's debugging connection changed, but write operations are never automatically retried.

The MCP layer keeps all 16 public tool names and input shapes. Existing optional `tabId` values become Chrome target IDs. When omitted, browser observation/action is allowed only when exactly one controllable page exists; ambiguity is an error. Actions use the target recorded in the observation handle, and element refs are validated against refs captured for that same observation.

Configuration is loaded from `~/.frobb/bridge.json`, defaults safely on first run, and rejects unknown keys, non-loopback hosts, invalid ports, non-absolute paths, the normal Chrome profile, and profile paths outside `~/.frobb`. Doctor uses the same loader and manager probes as runtime.

## Verification

- Unit tests for config validation, exact target routing, ref binding, stale navigation, process metadata/adoption, reconnect behavior, timeout/output limits, and secret redaction.
- MCP integration tests for observe/action/verification and confirmation flows without public schema changes.
- Full `npm run verify`, `npm run build`, and `npm run doctor`.
- Opt-in read-only live test that starts/adopts only the dedicated Frobb Chrome profile, lists targets, and observes one page without clicks, typing, navigation, focus changes, or native actions.

## Non-goals

No remote bind, arbitrary URL proxy, arbitrary CDP method, arbitrary JavaScript, arbitrary command execution, profile import, external account change, publishing, or other consequential live action.
