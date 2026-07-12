/**
 * Fastify plugin.
 *
 *   import { analyticsPlugin } from "@ai-analytics/sdk/fastify";
 *   await app.register(analyticsPlugin, { apiKey, host, getUserId: (req) => req.user?.id });
 *
 *   app.post("/orders", async (req) => {
 *     req.analytics.track("order_created", { total: 99 });
 *   });
 */
import { NodeAnalytics, type NodeAnalyticsOptions } from "./node.js";
import type { ScopedAnalytics } from "./express.js";

export interface FastifyAnalyticsOptions extends NodeAnalyticsOptions {
  getUserId?: (req: unknown) => string | undefined;
}

/** Plain-function plugin — register with `app.register(analyticsPlugin, opts)`. */
export async function analyticsPlugin(
  app: {
    decorateRequest(name: string, value: unknown): void;
    addHook(name: "onRequest" | "onClose", cb: (...args: any[]) => Promise<void> | void): void;
  },
  options: FastifyAnalyticsOptions
): Promise<void> {
  const client = new NodeAnalytics(options);
  app.decorateRequest("analytics", null);

  app.addHook("onRequest", async (req: { analytics?: ScopedAnalytics }) => {
    const userId = options.getUserId?.(req);
    req.analytics = {
      track: (name, properties) => client.track(name, properties, { userId }),
      identify: (uid, traits) => client.identify(uid, traits),
    };
  });

  app.addHook("onClose", async () => { await client.shutdown(); });
}
