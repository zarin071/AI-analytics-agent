/**
 * Express middleware.
 *
 *   import { analyticsMiddleware } from "@ai-analytics/sdk/express";
 *   app.use(analyticsMiddleware({ apiKey, host, getUserId: (req) => req.user?.id }));
 *
 *   // later in any handler:
 *   req.analytics.track("api_key_created", { scope: "read" });
 *
 * Optionally auto-tracks requests as `api_request_completed` (off by default —
 * page-view-style noise is rarely useful server-side).
 */
import { NodeAnalytics, type NodeAnalyticsOptions } from "./node.js";

interface ExpressReq {
  method: string; path: string;
  headers: Record<string, unknown>;
  analytics?: ScopedAnalytics;
  [key: string]: unknown;
}
interface ExpressRes { statusCode: number; on(event: string, cb: () => void): void }

export interface ScopedAnalytics {
  track(name: string, properties?: Record<string, unknown>): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
}

export interface ExpressAnalyticsOptions extends NodeAnalyticsOptions {
  getUserId?: (req: ExpressReq) => string | undefined;
  trackRequests?: boolean;
}

export function analyticsMiddleware(options: ExpressAnalyticsOptions) {
  const client = new NodeAnalytics(options);

  return (req: ExpressReq, res: ExpressRes, next: () => void) => {
    const userId = options.getUserId?.(req);

    req.analytics = {
      track: (name, properties) => client.track(name, properties, { userId }),
      identify: (uid, traits) => client.identify(uid, traits),
    };

    if (options.trackRequests) {
      const start = Date.now();
      res.on("finish", () => {
        client.track("api_request_completed", {
          method: req.method, path: req.path,
          status: res.statusCode, duration_ms: Date.now() - start,
        }, { userId });
      });
    }
    next();
  };
}
