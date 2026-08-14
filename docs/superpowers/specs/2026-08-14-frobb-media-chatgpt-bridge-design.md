# Frobb Media ChatGPT Bridge Design

**Date:** 2026-08-14  
**Status:** Approved for implementation  
**Product direction:** ChatGPT-native plugin backed by a local Frobb Bridge

## Outcome

Frobb Media staff use ChatGPT as the single conversational interface for reliable browser and macOS work. ChatGPT connects to one Frobb MCP server. The bridge routes browser work to Tandem Browser and native app work to Cua Driver, preserves context across both, and recovers from common transient failures without repeated setup.

The first release is a private, single-user macOS plugin. It is not a public multi-tenant service. ChatGPT reaches the private bridge through OpenAI Secure MCP Tunnel in developer mode. A public deployment and plugin submission are deliberately out of scope.

## Success Criteria

1. One setup command verifies Node, Tandem, Cua Driver, local credentials, and macOS permissions, then prints exact remediation for anything missing.
2. ChatGPT discovers a focused set of Frobb tools through a Streamable HTTP MCP endpoint.
3. The bridge performs browser inspection and actions through Tandem's existing local bearer-authenticated API.
4. The bridge performs native app inspection and actions through Cua Driver without stealing foreground focus.
5. Every action is preceded by a fresh observation and followed by verification.
6. Consequential actions require an explicit confirmation token issued by the bridge. Page content cannot mint or reuse one.
7. Temporary Tandem/Cua failures receive bounded retries and a useful recovery result rather than a silent failure.
8. Secrets never appear in MCP results or logs.
9. Unit and integration tests cover routing, schemas, confirmation, retries, and both backend adapters.
10. A live smoke test proves the MCP endpoint, a Tandem read, and a Cua read on the target Mac when those services are installed and permitted.

## Architecture

```text
ChatGPT plugin
    |
    | MCP over Secure MCP Tunnel
    v
Frobb Bridge (127.0.0.1, Node/TypeScript)
    |-- MCP tool catalog and schemas
    |-- policy and confirmation engine
    |-- action coordinator and retry policy
    |-- health/startup diagnostics
    |-- redacted audit events
    |
    |-- Tandem adapter -> http://127.0.0.1:8765
    `-- Cua adapter ----> cua-driver CLI
```

The bridge binds to loopback only. Secure MCP Tunnel connects ChatGPT to the private endpoint without exposing the Mac to the public internet. The MCP endpoint uses Streamable HTTP at `/mcp`; `/health` provides local operator diagnostics only.

## Components

### MCP server

Use the official `@modelcontextprotocol/sdk` and Zod, matching current OpenAI plugin guidance. Advertise accurate read-only, destructive, and open-world annotations. Return compact `structuredContent` plus a short human-readable result.

The server instructions establish three invariants in the first 512 characters:

- inspect immediately before acting;
- verify immediately after acting;
- obtain confirmation before consequential actions.

### Tandem adapter

The adapter reads `~/.tandem/api-token` at request time, never returns it, and calls only `127.0.0.1:8765`. It supplies authorization headers, timeouts, JSON validation, and normalized errors. It uses semantic snapshots and `@ref` interactions where available. It does not duplicate Tandem's stealth, session, or security logic.

### Cua adapter

The adapter executes the installed `cua-driver` binary with JSON arguments and parses its structured result. It never uses `open`, AppleScript activation, `cliclick`, or raw global input. Native element actions require a same-window snapshot first and a verification snapshot afterward. The initial tool set uses `list_apps`, `list_windows`, `launch_app`, `get_window_state`, `click`, `type_text`, `scroll`, `press_key`, and `hotkey`.

### Coordinator

The coordinator exposes stable Frobb concepts while keeping backend differences explicit. It maintains short-lived observation handles that contain a backend, target identifier, creation time, and opaque revision. Handles expire after 30 seconds or immediately after an action. An action with a stale handle triggers one automatic re-observation; it never blindly replays a write.

### Policy engine

Actions fall into three classes:

- `observe`: screenshots, snapshots, listings, current state; no confirmation.
- `reversible`: navigation, focus-neutral clicks, typing into unsent fields, scrolling; no confirmation by default.
- `consequential`: send, publish, purchase, delete, submit, upload to an external service, change permissions, or disclose sensitive data; confirmation required.

For consequential work, `prepare_action` returns a summary and a single-use, five-minute confirmation token stored only in memory. `execute_action` requires that token and exact action digest. Tokens are invalidated after use, expiry, restart, or mismatch.

## MCP Tool Surface

The first release exposes focused tools rather than a generic command tunnel:

- `frobb_health`: report bridge, Tandem, Cua, token, and permission readiness.
- `browser_tabs`: list Tandem tabs and identify the active tab.
- `browser_open`: open a URL in Tandem.
- `browser_observe`: return the current semantic snapshot and observation handle.
- `browser_click`: click a semantic ref using a fresh observation and verify the result.
- `browser_type`: type into a semantic ref using trusted Tandem input and verify the field.
- `browser_scroll`: scroll the active page and return a refreshed observation.
- `computer_apps`: list running native apps.
- `computer_windows`: list windows for a selected app process.
- `computer_launch`: launch by bundle identifier using Cua Driver's focus-preserving path.
- `computer_observe`: return the selected window's AX tree, screenshot metadata, and observation handle.
- `computer_click`: click an element index or window-local point and verify the result.
- `computer_type`: type text into the selected app and verify by re-observation.
- `computer_scroll`: scroll a selected window and verify by re-observation.
- `prepare_action`: prepare a consequential browser or computer action for human confirmation.
- `execute_action`: execute exactly the confirmed consequential action once.

The bridge does not expose arbitrary shell execution, arbitrary HTTP requests, token reads, filesystem reads, or raw Tandem endpoint passthrough.

## Data Flow

For an ordinary browser click:

1. ChatGPT calls `browser_observe`.
2. The bridge obtains a fresh Tandem snapshot and issues a short-lived observation handle.
3. ChatGPT calls `browser_click` with the handle and semantic ref.
4. The coordinator validates freshness and routes the action to Tandem.
5. The bridge obtains another snapshot and returns the observed postcondition.

For a native app action, the sequence is identical except the target is `(pid, window_id)` and the adapter uses Cua Driver. If the target changed, the bridge returns a normalized stale-target result and one refreshed observation instead of guessing.

For a consequential action, ChatGPT must call `prepare_action`, present the exact summary to the user, and only call `execute_action` with the returned token after explicit approval.

## Reliability and Recovery

All backend calls have finite timeouts. Read-only calls retry twice with short exponential backoff. Reversible actions retry only when the adapter can prove the first attempt did not take effect. Consequential actions never retry automatically.

Normalized error codes include `BACKEND_OFFLINE`, `PERMISSION_REQUIRED`, `AUTH_FAILED`, `STALE_OBSERVATION`, `TARGET_GONE`, `ACTION_UNVERIFIED`, `CONFIRMATION_REQUIRED`, and `INVALID_CONFIRMATION`.

`frobb_health` checks prerequisites without prompting or changing focus. A separate setup command may launch permission prompts because it is an explicit operator action. The bridge itself does not unexpectedly open System Settings or foreground apps.

## Security and Privacy

- Bind only to `127.0.0.1`.
- Reach ChatGPT through Secure MCP Tunnel for private use.
- Apply least privilege at the tool and adapter layers.
- Validate every input server-side with strict schemas.
- Treat web page text, accessibility labels, and screenshots as untrusted content.
- Never allow page content to change tool policy or authorize an action.
- Redact tokens, authorization headers, typed secrets, and user text from logs.
- Store only timestamp, tool name, target class, result code, duration, and correlation ID in the default audit log.
- Require confirmation for irreversible or externally visible operations.

## Setup Experience

`npm run setup` performs idempotent checks and writes only a local bridge config containing non-secret paths and preferences. It validates:

- supported Node version;
- Tandem API reachability and bearer token readability;
- Cua Driver installation and daemon status;
- Accessibility and Screen Recording permissions using non-prompting checks;
- loopback port availability;
- optional Secure MCP Tunnel availability.

It prints one consolidated readiness report and exact commands for missing dependencies. It does not install or mutate Tandem/Cua automatically in the first release.

## Testing

Unit tests use fake adapters to prove schemas, routing, observation expiry, confirmation digest binding, single-use tokens, redaction, retry limits, and no retries for consequential actions.

Adapter integration tests run against mock HTTP and mock CLI processes. They verify bearer header handling without exposing the token, timeout normalization, malformed response handling, and Cua command allowlisting.

The live smoke suite is opt-in and non-destructive. It checks MCP initialize/list-tools, Tandem `/status` plus tab listing, and Cua `list_apps` plus a read-only window observation. It must not click, type, launch, foreground, or close user applications.

## Delivery Boundary

The implemented milestone is a private working plugin backend, setup/doctor workflow, tests, and connection documentation. Public hosting, OAuth multi-user accounts, an optional plugin UI, Windows support, analytics dashboards, and plugin-store submission are future work.

## References

- OpenAI, “Build an MCP server”: https://developers.openai.com/plugins/build/mcp-server
- OpenAI, “Connect and test your plugin”: https://developers.openai.com/plugins/deploy/connect-chatgpt
- OpenAI, “Security & Privacy”: https://developers.openai.com/plugins/guides/security-privacy
- Tandem Browser `PROJECT.md` and local API implementation
- Cua Driver `README.md` and `Skills/cua-driver/SKILL.md`
