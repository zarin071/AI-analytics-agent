/**
 * Node.js adapter — server-side tracking with explicit user ids.
 * No browser context, no persistence; flushes on interval and on shutdown.
 *
 *   const analytics = new NodeAnalytics({ apiKey: process.env.ANALYTICS_SECRET_KEY!, host });
 *   analytics.track("invoice_generated", { amount }, { userId: "user_42" });
 *   await analytics.shutdown();
 */
import { Analytics, type AnalyticsOptions, type SdkEvent } from "../core/analytics.js";

export interface NodeAnalyticsOptions extends Omit<AnalyticsOptions, "storage"> {}

export class NodeAnalytics {
  private client: Analytics;

  constructor(options: NodeAnalyticsOptions) {
    this.client = Analytics.init({
      flushIntervalMs: 2000,
      ...options,
      storage: { get: () => null, set: () => {} },   // stateless on servers
      defaultContext: { server: true, ...options.defaultContext },
    });
    process.once("beforeExit", () => void this.client.shutdown());
  }

  track(name: string, properties: Record<string, unknown> = {}, ids: { userId?: string; anonymousId?: string } = {}): void {
    // Server events carry explicit ids; bypass the client identity state.
    const event: SdkEvent = {
      name,
      userId: ids.userId,
      anonymousId: ids.anonymousId,
      timestamp: new Date().toISOString(),
      properties,
      context: { sdk: { name: "@ai-analytics/sdk-node", version: "1.0.0" }, server: true },
    };
    this.client.trackRaw(event);
  }

  identify(userId: string, traits: Record<string, unknown> = {}): void {
    this.client.identify(userId, traits);
  }

  flush(): Promise<void> { return this.client.flush(); }
  shutdown(): Promise<void> { return this.client.shutdown(); }
}
