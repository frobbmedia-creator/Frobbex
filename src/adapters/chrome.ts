import { BridgeError } from "../core/index.js";

type JsonObject = Record<string, unknown>;
export interface ChromeTab extends JsonObject { id: string; title: string; url: string }
export type ChromeOperation =
  | { kind: "observe" }
  | { kind: "click"; ref: string; confirmed: boolean }
  | { kind: "type"; ref: string; value: string; confirmed: boolean }
  | { kind: "scroll"; direction: "up" | "down"; amount: number };

export interface ChromeBackend {
  health(): Promise<JsonObject>;
  tabs(): Promise<ChromeTab[]>;
  open(url: string): Promise<JsonObject>;
  operate(targetId: string, operation: ChromeOperation): Promise<JsonObject>;
}

export class ChromeAdapter {
  constructor(private readonly options: { backend: ChromeBackend }) {}
  health(): Promise<JsonObject> { return this.options.backend.health(); }
  async tabs(): Promise<{ tabs: JsonObject[]; groups: JsonObject[] }> { return { tabs: await this.options.backend.tabs(), groups: [] }; }
  open(url: string, _focus = true): Promise<JsonObject> { return this.options.backend.open(url); }
  async snapshot(tabId?: string): Promise<JsonObject> { return this.options.backend.operate(await this.resolveTarget(tabId), { kind: "observe" }); }
  async click(tabId: string | undefined, ref: string, confirmed = false): Promise<JsonObject> { return this.options.backend.operate(await this.resolveTarget(tabId), { kind: "click", ref, confirmed }); }
  async type(tabId: string | undefined, ref: string, value: string, confirmed = false): Promise<JsonObject> { return this.options.backend.operate(await this.resolveTarget(tabId), { kind: "type", ref, value, confirmed }); }
  async scroll(tabId: string | undefined, direction: "up" | "down", amount: number): Promise<JsonObject> { return this.options.backend.operate(await this.resolveTarget(tabId), { kind: "scroll", direction, amount }); }

  private async resolveTarget(tabId?: string): Promise<string> {
    const tabs = await this.options.backend.tabs();
    if (tabId) {
      if (!tabs.some((tab) => tab.id === tabId)) throw new BridgeError("TARGET_GONE", "The selected Chrome tab no longer exists");
      return tabId;
    }
    if (tabs.length !== 1) throw new BridgeError("INVALID_INPUT", "tabId is required unless exactly one Chrome tab is open");
    return tabs[0]!.id;
  }
}
