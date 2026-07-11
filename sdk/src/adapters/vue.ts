/**
 * Vue 3 adapter — plugin + composable.
 *
 *   import { createAnalytics } from "@ai-analytics/sdk/vue";
 *   app.use(createAnalytics({ apiKey, host, router }));   // router optional
 *
 *   const analytics = useAnalytics();
 *   analytics.track("report_exported");
 */
import { inject, type App, type InjectionKey } from "vue";
import { Analytics, type AnalyticsOptions } from "../core/analytics.js";

export const ANALYTICS_KEY: InjectionKey<Analytics> = Symbol("analytics");

interface VueAnalyticsOptions extends AnalyticsOptions {
  /** vue-router instance; if given, page views are tracked automatically. */
  router?: { afterEach(cb: (to: { fullPath: string; name?: unknown }) => void): void };
}

export function createAnalytics(options: VueAnalyticsOptions) {
  return {
    install(app: App) {
      const client = Analytics.init(options);
      app.provide(ANALYTICS_KEY, client);
      app.config.globalProperties.$analytics = client;
      options.router?.afterEach((to) => {
        client.page(String(to.name ?? ""), { path: to.fullPath });
      });
    },
  };
}

export function useAnalytics(): Analytics {
  const client = inject(ANALYTICS_KEY);
  if (!client) throw new Error("Install the analytics plugin with app.use(createAnalytics(...)) first");
  return client;
}
