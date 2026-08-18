# Frobbex

**Local computer use that actually works.**

True computer use was a dream for a year and a half. ChatGPT Desktop didn't deliver it. Grok Desktop didn't deliver it. Hermes didn't deliver it. After failing and failing and failing, I built the bridge I needed.

Frobbex is a local MCP server that gives ChatGPT real control of a **dedicated Chrome profile** and **macOS native apps** — with observe-before-act, verify-after-act, and hard confirmation for anything consequential.

It runs on your machine. Loopback only. No cloud agent. No theater.

```text
ChatGPT (developer mode + Secure MCP Tunnel)
        |
        v
Frobbex Bridge  →  http://127.0.0.1:8790/mcp
        |
        |-- dedicated Chrome profile (~/.frobb/chrome-profile) via CDP
        `-- Cua Driver → macOS Accessibility (apps, windows, click, type)
```

## What works today

| Surface | Status |
|---|---|
| Dedicated Chrome profile (open, observe, click, type, scroll) | Working |
| Observe → act → verify loop | Working |
| Consequential-action confirmation tokens | Working |
| macOS native apps via Cua Driver | Implemented; requires Cua + TCC permissions |
| ChatGPT via OpenAI Secure MCP Tunnel | Working |
| Windows / Linux | Not yet |
| Multi-user / public plugin store | Out of scope for v0.1 |

## Non-negotiables

These stay true even if the rest of the world changes:

- **Loopback only.** The bridge never binds beyond `127.0.0.1` / `::1`.
- **Dedicated profile only.** Frobbex never attaches to your normal Chrome profile.
- **No arbitrary power tools.** No shell, no raw HTTP, no filesystem, no free-form JavaScript, no CDP passthrough.
- **Observe before every action. Verify after.** Stale observations are rejected, not replayed.
- **Consequential actions require human confirmation.** Send, publish, purchase, delete, submit, upload, permission changes, and sensitive disclosure go through `prepare_action` → single-use token → `execute_action`.
- **Secrets never leave the machine in results or logs.** Tokens, typed text, and screenshot bytes are redacted.

## Requirements

- macOS
- Node.js 22+
- Google Chrome (standard `/Applications` install works)
- Dedicated profile under `~/.frobb` (created by setup)
- [Cua Driver](https://github.com/trycua/cua) installed, running, with Accessibility + Screen Recording
- OpenAI `tunnel-client` + ChatGPT developer mode for the private connection

## Install

```bash
git clone https://github.com/frobbmedia-creator/Frobbex.git
cd Frobbex
npm install
npm run setup
npm run doctor
```

`setup` writes non-secret defaults to `~/.frobb/bridge.json` with owner-only permissions.  
`doctor` reports every missing prerequisite in one pass. It does not launch apps or prompt for permissions.

Start the bridge:

```bash
npm run dev
```

MCP lives at `http://127.0.0.1:8790/mcp`. Local readiness is at `/health`.

## Connect ChatGPT

1. Create a tunnel in [OpenAI Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels) and associate your ChatGPT workspace.
2. Download `tunnel-client` from that page.
3. Export your runtime key as `CONTROL_PLANE_API_KEY`.
4. Configure and run:

```bash
tunnel-client init \
  --sample sample_mcp_http_local \
  --profile frobb-local \
  --tunnel-id YOUR_TUNNEL_ID \
  --mcp-server-url http://127.0.0.1:8790/mcp

tunnel-client doctor --profile frobb-local --explain
tunnel-client run --profile frobb-local
```

5. In ChatGPT: Settings → Security → enable **Developer mode**.
6. Open Plugins → create a developer-mode app → select **Tunnel** → choose the Frobb tunnel.

You should see 16 focused tools. Official docs: [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt) · [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

## Tool surface

**Bridge**
- `frobb_health` — readiness of bridge, Chrome, Cua, permissions

**Browser** (dedicated Frobb Chrome only)
- `browser_tabs` · `browser_open` · `browser_observe`
- `browser_click` · `browser_type` · `browser_scroll`

**Computer** (macOS via Cua Driver)
- `computer_apps` · `computer_windows` · `computer_launch`
- `computer_observe` · `computer_click` · `computer_type` · `computer_scroll`

**Consequential**
- `prepare_action` — summarize + mint a single-use confirmation token
- `execute_action` — run exactly the confirmed action once

## Help wanted

This is the real thing, not a demo. Help make it greater.

Hard problems worth solving:

1. **Windows / Linux ports** — same policy layer, different native backends
2. **Better semantic observation** — the current Chrome ref heuristic tops out at 500 interactive nodes; smarter extraction and stability would help every agent
3. **Cua-free native path** — a clean Accessibility fallback so the computer half is not blocked on one driver
4. **Multi-model backends** — Claude, Grok, local models without weakening the confirmation and audit invariants
5. **Tunnel / plugin UX** — fewer steps between `npm run dev` and a working ChatGPT session

Open an issue. Send a PR. Fork it and show what you built.

## Safety model (short version)

- Fresh observation before every write; verification snapshot after.
- Observation handles expire after ~30s or after one use.
- Consequential actions cannot be minted by page content; only the bridge issues confirmation tokens.
- Writes are never retried. Reads get bounded retries.
- Audit log keeps metadata only: tool, target class, result code, duration, correlation ID.

See OpenAI's [MCP server guidance](https://developers.openai.com/plugins/build/mcp-server) and [plugin security guidance](https://developers.openai.com/plugins/guides/security-privacy).

## Verify

```bash
npm run verify
FROBB_LIVE_TEST=1 npm test -- tests/live/read-only-smoke.test.ts
```

The live suite is opt-in and read-only. It does not click, type, scroll, launch, close, publish, send, submit, or delete anything.

## License

MIT — see [LICENSE](LICENSE).

Built by [Frobb Media](https://github.com/frobbmedia-creator). Real rooms. Real tools. No theater.
