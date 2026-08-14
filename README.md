# Frobb Media Bridge

Frobb Bridge is the private ChatGPT plugin backend for frictionless Tandem Browser and macOS computer use. It runs locally, exposes one focused MCP toolset, and routes browser actions to Tandem and native app actions to Cua Driver.

## Requirements

- macOS
- Node.js 22 or newer
- Tandem Browser running on `127.0.0.1:8765`
- `~/.tandem/api-token`
- Cua Driver installed, running, and granted Accessibility plus Screen Recording
- OpenAI `tunnel-client` and ChatGPT developer mode for the private ChatGPT connection

## Install and check

```bash
npm install
npm run setup
npm run doctor
```

`setup` writes only non-secret defaults to `~/.frobb/bridge.json`. Neither command installs software, prompts for permissions, launches apps, or changes foreground focus.

Start the bridge:

```bash
npm run dev
```

The server listens only at `http://127.0.0.1:8790`. MCP is at `/mcp`; local readiness is at `/health`.

## Connect ChatGPT privately

1. Create a tunnel in [OpenAI Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels) and associate the target ChatGPT workspace.
2. Download the current `tunnel-client` from that page.
3. Set the runtime key in your shell as `CONTROL_PLANE_API_KEY`.
4. Configure an HTTP profile:

```bash
tunnel-client init \
  --sample sample_mcp_http_local \
  --profile frobb-local \
  --tunnel-id YOUR_TUNNEL_ID \
  --mcp-server-url http://127.0.0.1:8790/mcp

tunnel-client doctor --profile frobb-local --explain
tunnel-client run --profile frobb-local
```

5. In ChatGPT, open Settings → Security and login and enable Developer mode.
6. Open ChatGPT Plugins, create a developer-mode app, select **Tunnel**, choose the Frobb tunnel, and review the 16 discovered tools.

Developer mode and tunnel availability depend on account/workspace policy. The official connection flow is documented in [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt) and [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

## Safety model

- Observe immediately before each action and verify immediately afterward.
- Browser actions use Tandem semantic refs and trusted input.
- Native actions use Cua Driver and do not intentionally steal focus.
- Send, publish, purchase, delete, submit, upload, permission, and sensitive-disclosure actions require `prepare_action` followed by a single-use `execute_action` confirmation.
- Tandem tokens, authorization headers, entered text, and screenshot bytes are not returned or logged.
- No arbitrary shell, HTTP, filesystem, or raw backend passthrough tool exists.

See OpenAI's [MCP server guidance](https://developers.openai.com/plugins/build/mcp-server) and [plugin security guidance](https://developers.openai.com/plugins/guides/security-privacy).

## Troubleshooting

Run `npm run doctor` first. It reports all missing prerequisites in one pass. Common remediations:

- Start Tandem if `Tandem local API` fails.
- Install/start Cua Driver if its binary or daemon check fails.
- Grant Accessibility and Screen Recording to `CuaDriver.app` in System Settings → Privacy & Security.
- Run `tunnel-client doctor --profile frobb-local --explain` if ChatGPT cannot discover tools.

## Verification

```bash
npm run verify
FROBB_LIVE_TEST=1 npm test -- tests/live/read-only-smoke.test.ts
```

The live suite is opt-in and read-only. It does not click, type, scroll, launch, close, publish, send, submit, or delete anything.
