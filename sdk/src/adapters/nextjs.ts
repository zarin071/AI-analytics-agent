/**
 * Next.js adapter (App Router).
 *
 * Client side: re-exports the React provider/hooks plus a route-change
 * page tracker. Server side: `serverAnalytics()` gives a Node client for
 * Route Handlers / Server Actions (uses a secret key, no persistence).
 *
 *   // app/providers.tsx ("use client")
 *   <AnalyticsProvider options={{ apiKey: process.env.NEXT_PUBLIC_ANALYTICS_KEY!, host: "..." }}>
 *   <NextPageTracker />
 *
 *   // app/api/checkout/route.ts
 *   const analytics = serverAnalytics();
 *   analytics.track("checkout_completed", { revenue }, { userId });
 */
export { AnalyticsProvider, useAnalytics, useTrackOnMount, usePageView } from "./react.js";
export { NodeAnalytics as serverAnalyticsClient } from "./node.js";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation.js";
import { useAnalytics } from "./react.js";
import { NodeAnalytics, type NodeAnalyticsOptions } from "./node.js";

/** Mount once inside the provider: tracks page_viewed on every route change. */
export function NextPageTracker(): null {
  const analytics = useAnalytics();
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    analytics.page(undefined, { path: pathname, search: search?.toString() || undefined });
  }, [analytics, pathname, search]);
  return null;
}

let serverSingleton: NodeAnalytics | null = null;

/** Server-side client (Route Handlers, Server Actions, RSC). */
export function serverAnalytics(options?: Partial<NodeAnalyticsOptions>): NodeAnalytics {
  if (!serverSingleton) {
    serverSingleton = new NodeAnalytics({
      apiKey: options?.apiKey ?? process.env.ANALYTICS_SECRET_KEY ?? "",
      host: options?.host ?? process.env.ANALYTICS_HOST ?? "http://localhost:4000",
      ...options,
    });
  }
  return serverSingleton;
}
