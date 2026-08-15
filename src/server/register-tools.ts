import { createHash, randomUUID } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ActionCoordinator, AuditLogger, BridgeError, ConfirmationStore, ObservationStore, withReadRetry } from "../core/index.js";
import type { BridgeServices } from "./app.js";
import * as schemas from "./tool-schemas.js";

export interface BridgePolicy {
  observations: ObservationStore;
  confirmations: ConfirmationStore;
  audit: AuditLogger;
}

export function registerTools(
  server: McpServer,
  services: BridgeServices,
  policy: BridgePolicy,
): void {
  const { observations, confirmations, audit } = policy;
  const coordinator = new ActionCoordinator(observations);

  server.registerTool("frobb_health", {
    title: "Check Frobb readiness",
    description: "Check whether the Frobb Bridge, Tandem Browser, Cua Driver, and macOS permissions are ready.",
    inputSchema: schemas.emptyInput,
    outputSchema: schemas.commonOutput,
    annotations: readOnlyAnnotations(),
  }, audited(audit, "frobb_health", "bridge", async () => result(await health(services), "Checked Frobb browser and computer readiness.")));

  server.registerTool("browser_tabs", {
    title: "List browser tabs",
    description: "List dedicated Frobb Chrome tabs before choosing an exact browser target.",
    inputSchema: schemas.emptyInput,
    outputSchema: schemas.commonOutput,
    annotations: readOnlyAnnotations(),
  }, audited(audit, "browser_tabs", "browser", async () => {
    const data = await withReadRetry(() => services.tandem.tabs());
    return result(data, `Found ${data.tabs.length} Frobb Chrome tab${data.tabs.length === 1 ? "" : "s"}.`);
  }));

  server.registerTool("browser_open", {
    title: "Open in Tandem",
    description: "Open a URL in the dedicated Frobb Chrome profile. This does not submit, purchase, publish, delete, or send anything.",
    inputSchema: schemas.browserOpenInput,
    outputSchema: schemas.commonOutput,
    annotations: reversibleAnnotations(true),
  }, audited(audit, "browser_open", "browser", async ({ url, focus }) => result(await services.tandem.open(url, focus), "Opened the URL in Tandem Browser.")));

  server.registerTool("browser_observe", {
    title: "Observe browser page",
    description: "Get a fresh semantic page snapshot immediately before a browser action.",
    inputSchema: schemas.browserObserveInput,
    outputSchema: schemas.commonOutput,
    annotations: readOnlyAnnotations(),
  }, audited(audit, "browser_observe", "browser", async ({ tabId }) => {
    const target = browserTarget(tabId);
    const observed = await coordinator.observe("tandem", target, async () => {
      const data = await withReadRetry(() => services.tandem.snapshot(tabId));
      return { revision: revision(data), data };
    });
    return result(observed, "Observed the current Tandem page. Use this observation once and promptly.");
  }));

  server.registerTool("browser_click", {
    title: "Click browser element",
    description: "Click a reversible browser element from a fresh observation. For send, publish, purchase, delete, submit, upload, permission, or disclosure actions use prepare_action and execute_action instead.",
    inputSchema: schemas.browserClickInput,
    outputSchema: schemas.commonOutput,
    annotations: reversibleAnnotations(true),
  }, audited(audit, "browser_click", "browser", async ({ observationId, tabId, ref }) => browserClick(services, coordinator, { observationId, tabId, ref })));

  server.registerTool("browser_type", {
    title: "Type into browser field",
    description: "Type into an unsent browser field from a fresh observation. For consequential entry or disclosure use prepare_action and execute_action.",
    inputSchema: schemas.browserTypeInput,
    outputSchema: schemas.commonOutput,
    annotations: reversibleAnnotations(true),
  }, audited(audit, "browser_type", "browser", async ({ observationId, tabId, ref, text }) => browserType(services, coordinator, { observationId, tabId, ref, text })));

  server.registerTool("browser_scroll", {
    title: "Scroll browser page",
    description: "Scroll a Tandem page from a fresh observation and verify the resulting page state.",
    inputSchema: schemas.browserScrollInput,
    outputSchema: schemas.commonOutput,
    annotations: reversibleAnnotations(true),
  }, audited(audit, "browser_scroll", "browser", async ({ observationId, tabId, direction, amount }) => {
    const target = browserTarget(tabId);
    const data = await coordinator.act({ observationId, backend: "tandem", target, action: () => services.tandem.scroll(tabId, direction, amount), refresh: () => browserSnapshot(services, tabId), verify: async () => {
      const snapshot = await services.tandem.snapshot(tabId);
      return { revision: revision(snapshot), data: snapshot };
    } });
    return result(data, "Scrolled and verified the Tandem page.");
  }));

  server.registerTool("computer_apps", {
    title: "List running apps",
    description: "List running macOS apps through Cua Driver without changing foreground focus.",
    inputSchema: schemas.emptyInput,
    outputSchema: schemas.commonOutput,
    annotations: readOnlyAnnotations(),
  }, audited(audit, "computer_apps", "computer", async () => result(await withReadRetry(() => services.cua.listApps()), "Listed running macOS apps.")));

  server.registerTool("computer_windows", {
    title: "List app windows",
    description: "List windows for a macOS app process before selecting a computer target.",
    inputSchema: schemas.computerWindowsInput,
    outputSchema: schemas.commonOutput,
    annotations: readOnlyAnnotations(),
  }, audited(audit, "computer_windows", "computer", async ({ pid }) => result(await withReadRetry(() => services.cua.listWindows(pid)), `Listed windows for process ${pid}.`)));

  server.registerTool("computer_launch", {
    title: "Launch macOS app",
    description: "Launch a macOS app by bundle identifier using Cua Driver's focus-preserving launch path.",
    inputSchema: schemas.computerLaunchInput,
    outputSchema: schemas.commonOutput,
    annotations: reversibleAnnotations(false),
  }, audited(audit, "computer_launch", "computer", async ({ bundleId, urls }) => result(await services.cua.call("launch_app", { bundle_id: bundleId, ...(urls ? { urls } : {}) }), "Launched the app without intentionally stealing focus.")));

  server.registerTool("computer_observe", {
    title: "Observe app window",
    description: "Get a fresh accessibility snapshot for one macOS window immediately before a computer action.",
    inputSchema: schemas.computerObserveInput,
    outputSchema: schemas.commonOutput,
    annotations: readOnlyAnnotations(),
  }, audited(audit, "computer_observe", "computer", async ({ pid, windowId }) => {
    const target = computerTarget(pid, windowId);
    const observed = await coordinator.observe("cua", target, async () => {
      const raw = await withReadRetry(() => services.cua.observe(pid, windowId));
      return { revision: revision(raw), data: sanitizeObservation(raw) };
    });
    return result(observed, "Observed the selected macOS window. Use this observation once and promptly.");
  }));

  server.registerTool("computer_click", {
    title: "Click app element",
    description: "Click a reversible native element from a fresh window observation without moving the user's cursor. Use prepare_action for consequential clicks.",
    inputSchema: schemas.computerClickInput,
    outputSchema: schemas.commonOutput,
    annotations: reversibleAnnotations(false),
  }, audited(audit, "computer_click", "computer", async (args) => computerClick(services, coordinator, args)));

  server.registerTool("computer_type", {
    title: "Type into app",
    description: "Type into an unsent native field from a fresh window observation. Use prepare_action for consequential entry or disclosure.",
    inputSchema: schemas.computerTypeInput,
    outputSchema: schemas.commonOutput,
    annotations: reversibleAnnotations(false),
  }, audited(audit, "computer_type", "computer", async (args) => computerType(services, coordinator, args)));

  server.registerTool("computer_scroll", {
    title: "Scroll app window",
    description: "Scroll a selected macOS window from a fresh observation and verify it afterward.",
    inputSchema: schemas.computerScrollInput,
    outputSchema: schemas.commonOutput,
    annotations: reversibleAnnotations(false),
  }, audited(audit, "computer_scroll", "computer", async ({ observationId, pid, windowId, deltaY }) => {
    const target = computerTarget(pid, windowId);
    const data = await coordinator.act({ observationId, backend: "cua", target, action: () => services.cua.call("scroll", { pid, window_id: windowId, delta_y: deltaY }), refresh: () => computerSnapshot(services, pid, windowId), verify: async () => {
      const observed = await services.cua.observe(pid, windowId);
      return { revision: revision(observed), data: sanitizeObservation(observed) };
    } });
    return result(data, "Scrolled and verified the macOS window.");
  }));

  server.registerTool("prepare_action", {
    title: "Prepare consequential action",
    description: "Prepare an exact send, publish, purchase, delete, submit, upload, permission, or sensitive-disclosure action for explicit human confirmation. Does not execute it.",
    inputSchema: schemas.prepareActionInput,
    outputSchema: schemas.commonOutput,
    annotations: readOnlyAnnotations(),
  }, audited(audit, "prepare_action", "bridge", async ({ summary, action }) => result(confirmations.prepare(action, summary), `Confirmation required: ${summary}`)));

  server.registerTool("execute_action", {
    title: "Execute confirmed action",
    description: "Execute exactly one consequential action only after the human explicitly approved the prepared summary.",
    inputSchema: schemas.executeActionInput,
    outputSchema: schemas.commonOutput,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, audited(audit, "execute_action", "bridge", async ({ token, action }) => {
    confirmations.consume(token, action);
    switch (action.kind) {
      case "browser_click": return browserClick(services, coordinator, action, true);
      case "browser_type": return browserType(services, coordinator, action, true);
      case "computer_click": return computerClick(services, coordinator, action);
      case "computer_type": return computerType(services, coordinator, action);
    }
  }));
}

async function browserClick(services: BridgeServices, coordinator: ActionCoordinator, args: { observationId: string; tabId?: string | undefined; ref: string }, confirmed = false) {
  const target = browserTarget(args.tabId);
  const data = await coordinator.act({ observationId: args.observationId, backend: "tandem", target, action: () => services.tandem.click(args.tabId, args.ref, confirmed), refresh: () => browserSnapshot(services, args.tabId), verify: async () => {
    const snapshot = await services.tandem.snapshot(args.tabId);
    return { revision: revision(snapshot), data: snapshot };
  } });
  return result(data, "Clicked and verified the Tandem element.");
}

async function browserType(services: BridgeServices, coordinator: ActionCoordinator, args: { observationId: string; tabId?: string | undefined; ref: string; text: string }, confirmed = false) {
  const target = browserTarget(args.tabId);
  const data = await coordinator.act({ observationId: args.observationId, backend: "tandem", target, action: () => services.tandem.type(args.tabId, args.ref, args.text, confirmed), refresh: () => browserSnapshot(services, args.tabId), verify: async () => {
    const snapshot = await services.tandem.snapshot(args.tabId);
    return { revision: revision(snapshot), data: { count: snapshot.count, url: snapshot.url } };
  } });
  return result({ verified: data.verified, beforeRevision: data.beforeRevision, afterRevision: data.afterRevision }, "Typed and verified without returning the entered text.");
}

async function computerClick(services: BridgeServices, coordinator: ActionCoordinator, args: { observationId: string; pid: number; windowId: number; elementIndex: number }) {
  const target = computerTarget(args.pid, args.windowId);
  const actionArgs = { pid: args.pid, window_id: args.windowId, element_index: args.elementIndex };
  const data = await coordinator.act({ observationId: args.observationId, backend: "cua", target, action: () => services.cua.call("click", actionArgs), refresh: () => computerSnapshot(services, args.pid, args.windowId), verify: async () => {
    const observed = await services.cua.observe(args.pid, args.windowId);
    return { revision: revision(observed), data: sanitizeObservation(observed) };
  } });
  return result(data, "Clicked and verified the native app element.");
}

async function computerType(services: BridgeServices, coordinator: ActionCoordinator, args: { observationId: string; pid: number; windowId: number; elementIndex: number; text: string }) {
  const target = computerTarget(args.pid, args.windowId);
  const data = await coordinator.act({ observationId: args.observationId, backend: "cua", target, action: () => services.cua.call("type_text", { pid: args.pid, window_id: args.windowId, element_index: args.elementIndex, text: args.text }), refresh: () => computerSnapshot(services, args.pid, args.windowId), verify: async () => {
    const observed = await services.cua.observe(args.pid, args.windowId);
    return { revision: revision(observed), data: { has_screenshot: observed.has_screenshot === true } };
  } });
  return result({ verified: data.verified, beforeRevision: data.beforeRevision, afterRevision: data.afterRevision }, "Typed and verified without returning the entered text.");
}

async function health(services: BridgeServices): Promise<Record<string, boolean>> {
  const [tandem, cua, permissions] = await Promise.allSettled([services.tandem.health(), services.cua.status(), services.cua.permissions()]);
  const browser = tandem.status === "fulfilled";
  return { bridge: true, browser, tandem: browser, cua: cua.status === "fulfilled", permissions: permissions.status === "fulfilled" && permissions.value.accessibility === true && permissions.value.screen_recording === true };
}

function result(data: Record<string, unknown>, text: string) {
  return { structuredContent: data, content: [{ type: "text" as const, text }] };
}

type ToolResponse = ReturnType<typeof result> & { isError?: boolean };

function audited<TArgs>(
  audit: AuditLogger,
  tool: string,
  targetClass: "browser" | "computer" | "bridge",
  handler: (args: TArgs) => Promise<ToolResponse>,
): (args: TArgs) => Promise<ToolResponse> {
  return async (args) => {
    const startedAt = Date.now();
    const correlationId = randomUUID();
    try {
      const response = await handler(args);
      audit.record({
        timestamp: startedAt,
        correlationId,
        tool,
        targetClass,
        resultCode: "OK",
        durationMs: Date.now() - startedAt,
      });
      return {
        ...response,
        structuredContent: { ok: true, correlationId, ...response.structuredContent },
      };
    } catch (error) {
      const code = error instanceof BridgeError ? error.code : "INTERNAL_ERROR";
      const message = error instanceof BridgeError ? error.message : "The Frobb tool call failed";
      audit.record({
        timestamp: startedAt,
        correlationId,
        tool,
        targetClass,
        resultCode: code,
        durationMs: Date.now() - startedAt,
      });
      return {
        isError: true,
        structuredContent: { ok: false, correlationId, code, message, ...(error instanceof BridgeError && error.details !== undefined ? { details: error.details } : {}) },
        content: [{ type: "text", text: `${code}: ${message} (${correlationId})` }],
      };
    }
  };
}

function readOnlyAnnotations() {
  return { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
}

function reversibleAnnotations(openWorldHint: boolean) {
  return { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint };
}

function browserTarget(tabId?: string): string { return `tab:${tabId ?? "active"}`; }
function computerTarget(pid: number, windowId: number): string { return `${pid}:${windowId}`; }
function revision(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

async function browserSnapshot(services: BridgeServices, tabId?: string) {
  const data = await withReadRetry(() => services.tandem.snapshot(tabId));
  return { revision: revision(data), data };
}

async function computerSnapshot(services: BridgeServices, pid: number, windowId: number) {
  const raw = await withReadRetry(() => services.cua.observe(pid, windowId));
  return { revision: revision(raw), data: sanitizeObservation(raw) };
}

function sanitizeObservation(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/(?:png|base64|screenshot_(?:data|bytes))/i.test(key)));
}
