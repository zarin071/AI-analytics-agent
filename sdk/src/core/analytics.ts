/**
 * @ai-analytics/sdk — core client. Framework-free, isomorphic
 * (browser / Node / React Native): environment specifics are injected via
 * small adapter interfaces (storage, transport, context provider).
 *
 * Features: batching + retry with backoff, offline queue persistence,
 * anonymous ids, identify/alias, super properties, page/screen helpers,
 * automatic context (page, UTM, device), flush on page hide.
 */

export interface SdkEvent {
  name: string;
  userId?: string;
  anonymousId?: string;
  timestamp: string;
  properties: Record<string, unknown>;
  context: Record<string, unknown>;
  release?: string;
  experiment?: { key: string; variant: string };
}

export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface AnalyticsOptions {
  apiKey: string;                     // public key (pk_…)
  host: string;                       // e.g. https://analytics.yourapp.com
  flushIntervalMs?: number;           // default 5000
  maxBatchSize?: number;              // default 25
  maxQueueSize?: number;              // default 1000 (oldest dropped beyond)
  release?: string;                   // app version stamped on every event
  debug?: boolean;
  storage?: StorageAdapter;           // default: localStorage / in-memory
  fetchImpl?: typeof fetch;           // default: global fetch
  defaultContext?: Record<string, unknown>;
}

const SDK_INFO = { name: "@ai-analytics/sdk", version: "1.0.0" };

class MemoryStorage implements StorageAdapter {
  private m = new Map<string, string>();
  get(k: string) { return this.m.get(k) ?? null; }
  set(k: string, v: string) { this.m.set(k, v); }
}

function defaultStorage(): StorageAdapter {
  try {
    if (typeof localStorage !== "undefined") {
      return { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v) };
    }
  } catch { /* SSR / privacy mode */ }
  return new MemoryStorage();
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class Analytics {
  private queue: SdkEvent[] = [];
  private userId?: string;
  private anonymousId: string;
  private superProps: Record<string, unknown> = {};
  private timer?: ReturnType<typeof setInterval>;
  private storage: StorageAdapter;
  private fetchImpl: typeof fetch;
  private opts: Required<Pick<AnalyticsOptions, "flushIntervalMs" | "maxBatchSize" | "maxQueueSize">> & AnalyticsOptions;

  static init(options: AnalyticsOptions): Analytics {
    return new Analytics(options);
  }

  constructor(options: AnalyticsOptions) {
    this.opts = { flushIntervalMs: 5000, maxBatchSize: 25, maxQueueSize: 1000, ...options };
    this.storage = options.storage ?? defaultStorage();
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);

    this.anonymousId = this.storage.get("aa_anonymous_id") ?? uuid();
    this.storage.set("aa_anonymous_id", this.anonymousId);
    this.userId = this.storage.get("aa_user_id") ?? undefined;
    this.superProps = JSON.parse(this.storage.get("aa_super_props") ?? "{}");
    this.restoreQueue();

    this.timer = setInterval(() => void this.flush(), this.opts.flushIntervalMs);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") void this.flush(true);
      });
    }
  }

  /** Track an event. Name should follow object_action (server normalizes/validates). */
  track(name: string, properties: Record<string, unknown> = {}): void {
    this.enqueue({
      name,
      userId: this.userId,
      anonymousId: this.anonymousId,
      timestamp: new Date().toISOString(),
      properties: { ...this.superProps, ...properties },
      context: this.buildContext(),
      release: this.opts.release,
    });
  }

  /** Track a page/screen view. */
  page(nameOrProps?: string | Record<string, unknown>, properties: Record<string, unknown> = {}): void {
    const props = typeof nameOrProps === "string" ? { page_name: nameOrProps, ...properties } : { ...(nameOrProps ?? {}) };
    this.track("page_viewed", props);
  }

  /** Link the current anonymous user to your app's user id and set profile traits. */
  identify(userId: string, traits: Record<string, unknown> = {}): void {
    this.userId = userId;
    this.storage.set("aa_user_id", userId);
    this.enqueue({
      name: "$identify",
      userId,
      anonymousId: this.anonymousId,
      timestamp: new Date().toISOString(),
      properties: traits,
      context: this.buildContext(),
    });
  }

  /** Super properties: merged into every subsequent event. */
  register(props: Record<string, unknown>): void {
    this.superProps = { ...this.superProps, ...props };
    this.storage.set("aa_super_props", JSON.stringify(this.superProps));
  }

  /** Stamp experiment enrollment on subsequent events. */
  enrollExperiment(key: string, variant: string): void {
    this.register({ $experiment: { key, variant } });
  }

  /** Enqueue a fully-formed event (server adapters set explicit ids). */
  trackRaw(event: SdkEvent): void {
    this.enqueue(event);
  }

  /** Reset on logout — new anonymous identity. */
  reset(): void {
    this.userId = undefined;
    this.anonymousId = uuid();
    this.superProps = {};
    this.storage.set("aa_anonymous_id", this.anonymousId);
    this.storage.set("aa_user_id", "");
    this.storage.set("aa_super_props", "{}");
  }

  async flush(useBeacon = false): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.opts.maxBatchSize);
    this.persistQueue();
    const url = `${this.opts.host}/v1/track`;
    const body = JSON.stringify({ events: batch });

    try {
      if (useBeacon && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        // Auth via query param: sendBeacon cannot set headers.
        navigator.sendBeacon(`${url}?key=${encodeURIComponent(this.opts.apiKey)}`, body);
        return;
      }
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.opts.apiKey}` },
        body,
        keepalive: true,
      });
      if (res.status >= 500 || res.status === 429) throw new Error(`retryable ${res.status}`);
      // 4xx (other than 429): drop — the payload will never succeed.
    } catch (err) {
      // Network failure / retryable: put the batch back and back off.
      this.queue.unshift(...batch);
      if (this.queue.length > this.opts.maxQueueSize) this.queue.length = this.opts.maxQueueSize;
      this.persistQueue();
      if (this.opts.debug) console.warn("[analytics] flush failed, will retry", err);
    }
  }

  shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    return this.flush();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private enqueue(event: SdkEvent): void {
    if (this.opts.debug) console.debug("[analytics]", event.name, event.properties);
    this.queue.push(event);
    if (this.queue.length > this.opts.maxQueueSize) this.queue.shift();
    if (this.queue.length >= this.opts.maxBatchSize) void this.flush();
    this.persistQueue();
  }

  private buildContext(): Record<string, unknown> {
    const ctx: Record<string, unknown> = { sdk: SDK_INFO, ...this.opts.defaultContext };
    if (typeof window !== "undefined" && typeof location !== "undefined") {
      ctx.page = {
        url: location.href,
        path: location.pathname,
        referrer: typeof document !== "undefined" ? document.referrer : undefined,
        title: typeof document !== "undefined" ? document.title : undefined,
      };
      const params = new URLSearchParams(location.search);
      const utm: Record<string, string> = {};
      for (const k of ["source", "medium", "campaign", "term", "content"]) {
        const v = params.get(`utm_${k}`);
        if (v) utm[k] = v;
      }
      if (Object.keys(utm).length) ctx.utm = utm;
      ctx.locale = navigator.language;
      ctx.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    return ctx;
  }

  private persistQueue(): void {
    try { this.storage.set("aa_queue", JSON.stringify(this.queue.slice(0, 200))); } catch { /* full */ }
  }

  private restoreQueue(): void {
    try {
      const saved = this.storage.get("aa_queue");
      if (saved) this.queue = JSON.parse(saved);
    } catch { this.queue = []; }
  }
}
