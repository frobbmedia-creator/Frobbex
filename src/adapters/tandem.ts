import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { BridgeError } from "../core/index.js";

type JsonObject = Record<string, unknown>;

interface TandemAdapterOptions {
  baseUrl?: string;
  tokenProvider?: () => Promise<string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class TandemAdapter {
  private readonly baseUrl: string;
  private readonly tokenProvider: () => Promise<string>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: TandemAdapterOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://127.0.0.1:8765";
    this.tokenProvider = options.tokenProvider ?? defaultTokenProvider;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  health(): Promise<JsonObject> {
    return this.request("/status");
  }

  tabs(): Promise<{ tabs: JsonObject[]; groups: JsonObject[] }> {
    return this.request("/tabs/list");
  }

  open(url: string, focus = true): Promise<JsonObject> {
    return this.request("/tabs/open", { method: "POST", body: { url, focus, source: "wingman" } });
  }

  snapshot(tabId?: string): Promise<JsonObject> {
    return this.request("/snapshot?interactive=true&compact=true", {
      ...(tabId ? { headers: { "X-Tab-Id": tabId } } : {}),
    });
  }

  click(ref: string): Promise<JsonObject> {
    return this.request("/snapshot/click", { method: "POST", body: { ref } });
  }

  type(ref: string, value: string): Promise<JsonObject> {
    return this.request("/snapshot/fill", { method: "POST", body: { ref, value } });
  }

  scroll(direction: "up" | "down", amount: number): Promise<JsonObject> {
    return this.request("/scroll", { method: "POST", body: { direction, amount } });
  }

  private async request<T extends JsonObject>(
    path: string,
    options: { method?: "GET" | "POST"; body?: JsonObject; headers?: Record<string, string> } = {},
  ): Promise<T> {
    let token: string;
    try {
      token = (await this.tokenProvider()).trim();
    } catch {
      throw new BridgeError("AUTH_FAILED", "Tandem API token is unavailable");
    }
    if (!token) throw new BridgeError("AUTH_FAILED", "Tandem API token is empty");

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new BridgeError("BACKEND_OFFLINE", "Tandem Browser is unavailable");
    }

    if (response.status === 401 || response.status === 403) {
      throw new BridgeError("AUTH_FAILED", "Tandem rejected bridge authentication");
    }
    if (!response.ok) {
      throw new BridgeError(
        response.status === 404 ? "TARGET_GONE" : "INTERNAL_ERROR",
        `Tandem request failed with status ${response.status}`,
      );
    }

    try {
      const value = (await response.json()) as unknown;
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
      return value as T;
    } catch {
      throw new BridgeError("INTERNAL_ERROR", "Tandem returned malformed JSON");
    }
  }
}

async function defaultTokenProvider(): Promise<string> {
  return readFile(join(homedir(), ".tandem", "api-token"), "utf8");
}
