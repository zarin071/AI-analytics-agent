/**
 * React adapter — provider + hooks.
 *
 *   <AnalyticsProvider options={{ apiKey, host }}>
 *     <App />
 *   </AnalyticsProvider>
 *
 *   const analytics = useAnalytics();
 *   useTrackOnMount("pricing_page_viewed");
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { Analytics, type AnalyticsOptions } from "../core/analytics.js";

const AnalyticsContext = createContext<Analytics | null>(null);

export function AnalyticsProvider({ options, children }: { options: AnalyticsOptions; children: ReactNode }) {
  const client = useMemo(() => Analytics.init(options), [options.apiKey, options.host]);
  useEffect(() => () => void client.shutdown(), [client]);
  return <AnalyticsContext.Provider value={client}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics(): Analytics {
  const client = useContext(AnalyticsContext);
  if (!client) throw new Error("useAnalytics must be used inside <AnalyticsProvider>");
  return client;
}

export function useTrackOnMount(event: string, properties?: Record<string, unknown>): void {
  const analytics = useAnalytics();
  useEffect(() => { analytics.track(event, properties); }, [analytics, event]);
}

export function usePageView(pageName?: string): void {
  const analytics = useAnalytics();
  useEffect(() => { analytics.page(pageName); }, [analytics, pageName]);
}
