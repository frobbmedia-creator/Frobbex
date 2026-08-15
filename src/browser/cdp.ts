import { BridgeError } from "../core/index.js";
import type { ChromeBackend, ChromeOperation, ChromeTab } from "../adapters/chrome.js";
import { ChromeManager } from "./chrome-manager.js";

type JsonObject = Record<string, unknown>;
interface TargetDescriptor extends ChromeTab { type: string; webSocketDebuggerUrl?: string }

export class ChromeCdpBackend implements ChromeBackend {
  constructor(private readonly manager: ChromeManager) {}

  async health(): Promise<JsonObject> {
    const base = await this.manager.endpointUrl();
    const version = await getJson(base, "/json/version");
    return { ready: true, browser: typeof version.Browser === "string" ? version.Browser : "Chrome" };
  }

  async tabs(): Promise<ChromeTab[]> {
    return (await this.targets()).map(({ id, title, url }) => ({ id, title, url }));
  }

  async open(url: string): Promise<JsonObject> {
    if (!/^https?:\/\//i.test(url) && url !== "about:blank") throw new BridgeError("INVALID_INPUT", "Chrome can open only HTTP(S) URLs or about:blank");
    const base = await this.manager.endpointUrl();
    const response = await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: "PUT", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new BridgeError("BACKEND_OFFLINE", "Dedicated Frobb Chrome could not open a tab");
    return asObject(await response.json());
  }

  async operate(targetId: string, operation: ChromeOperation): Promise<JsonObject> {
    const target = (await this.targets()).find((entry) => entry.id === targetId);
    if (!target?.webSocketDebuggerUrl) throw new BridgeError("TARGET_GONE", "The selected Chrome tab no longer exists");
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    try {
      await client.call("Runtime.enable");
      if (operation.kind === "observe") return await evaluateObject(client, OBSERVE_EXPRESSION);
      if (operation.kind === "click") return await evaluateObject(client, actionExpression("click", operation.ref, undefined, operation.confirmed));
      if (operation.kind === "type") return await evaluateObject(client, actionExpression("type", operation.ref, operation.value, operation.confirmed));
      return await evaluateObject(client, scrollExpression(operation.direction, operation.amount));
    } finally { client.close(); }
  }

  private async targets(): Promise<TargetDescriptor[]> {
    const base = await this.manager.endpointUrl();
    const value = await getJsonArray(base, "/json/list");
    return value.filter((item): item is TargetDescriptor => item.type === "page" && typeof item.id === "string" && typeof item.title === "string" && typeof item.url === "string");
  }
}

class CdpClient {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: JsonObject): void; reject(error: Error): void }>();
  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      let message: Record<string, unknown>;
      try { message = JSON.parse(String(event.data)) as Record<string, unknown>; } catch { return; }
      const id = Number(message.id);
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      if (message.error) pending.reject(new BridgeError("INTERNAL_ERROR", "Chrome rejected a fixed browser operation"));
      else pending.resolve(asObject(message.result));
    });
  }
  static connect(url: string): Promise<CdpClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => { socket.close(); reject(new BridgeError("BACKEND_OFFLINE", "Chrome debugging connection timed out")); }, 5_000);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(new CdpClient(socket)); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new BridgeError("BACKEND_OFFLINE", "Chrome debugging connection failed")); }, { once: true });
    });
  }
  call(method: string, params: JsonObject = {}): Promise<JsonObject> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new BridgeError("BACKEND_OFFLINE", "Chrome operation timed out")); }, 5_000);
      this.pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close(): void { this.socket.close(); }
}

async function evaluateObject(client: CdpClient, expression: string): Promise<JsonObject> {
  const result = await client.call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  const exception = result.exceptionDetails;
  if (exception) throw new BridgeError("TARGET_GONE", "The observed Chrome page changed before the action");
  const remote = asObject(result.result);
  const value = remote.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BridgeError("INTERNAL_ERROR", "Chrome returned an invalid operation result");
  const object = value as JsonObject;
  if (object.ok === false) {
    if (object.code === "CONFIRMATION") throw new BridgeError("CONFIRMATION_REQUIRED", "This browser action requires prepare_action and execute_action");
    throw new BridgeError(object.code === "STALE" ? "STALE_OBSERVATION" : "TARGET_GONE", "The observed Chrome element is no longer available");
  }
  return object;
}

async function getJson(base: string, path: string): Promise<JsonObject> {
  try {
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(3_000) });
    if (!response.ok) throw new Error();
    return asObject(await response.json());
  } catch { throw new BridgeError("BACKEND_OFFLINE", "Dedicated Frobb Chrome is unavailable"); }
}
async function getJsonArray(base: string, path: string): Promise<JsonObject[]> {
  try {
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(3_000) });
    const value = await response.json();
    if (!response.ok || !Array.isArray(value)) throw new Error();
    return value.map(asObject);
  } catch { throw new BridgeError("BACKEND_OFFLINE", "Dedicated Frobb Chrome is unavailable"); }
}
function asObject(value: unknown): JsonObject { if (!value || typeof value !== "object" || Array.isArray(value)) throw new BridgeError("INTERNAL_ERROR", "Chrome returned malformed JSON"); return value as JsonObject; }

const OBSERVE_EXPRESSION = `(() => {
  const nodes = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]')].filter(e => { const r=e.getBoundingClientRect(); return r.width>0&&r.height>0; });
  const lines=[]; const refs={}; nodes.slice(0,500).forEach((e,i)=>{ const ref='@e'+(i+1); e.setAttribute('data-frobb-ref',ref); refs[ref]=e.tagName.toLowerCase(); const label=(e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent||e.getAttribute('placeholder')||'').trim().replace(/\\s+/g,' ').slice(0,200); lines.push(e.tagName.toLowerCase()+' '+label+' '+ref); });
  let h=2166136261; nodes.forEach(e=>{ const v=('value' in e?String(e.value):''); for(let i=0;i<v.length;i++){h^=v.charCodeAt(i);h=Math.imul(h,16777619);} });
  return { url:location.href, title:document.title, documentId:location.href+'|'+performance.timeOrigin, stateDigest:(h>>>0).toString(16), snapshot:lines.join('\\n'), count:lines.length, refs };
})()`;
function actionExpression(kind: "click" | "type", ref: string, value?: string, confirmed = false): string {
  const selector = `[data-frobb-ref=${JSON.stringify(ref)}]`;
  const guard = `const consequential=/(send|publish|purchase|buy|delete|submit|upload|permission|authorize|confirm|pay|post)/i.test((e.getAttribute('aria-label')||e.textContent||e.getAttribute('title')||'').trim()); if(consequential&&!${confirmed})return {ok:false,code:'CONFIRMATION'};`;
  if (kind === "click") return `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)return {ok:false,code:'STALE'}; ${guard} e.click(); return {ok:true}; })()`;
  return `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)return {ok:false,code:'STALE'}; if((e.type==='password'||/token|secret|password/i.test(e.name||''))&&!${confirmed})return {ok:false,code:'CONFIRMATION'}; const v=${JSON.stringify(value ?? "")}; e.focus(); const s=Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')?.set; if(s)s.call(e,v); else e.textContent=v; e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:v})); e.dispatchEvent(new Event('change',{bubbles:true})); return {ok:true}; })()`;
}
function scrollExpression(direction: "up" | "down", amount: number): string { return `(() => { const before=scrollY; scrollBy(0,${direction === "up" ? -amount : amount}); return {ok:true,before,after:scrollY}; })()`; }
