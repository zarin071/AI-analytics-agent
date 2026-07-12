/**
 * Angular adapter — injectable service + router hookup.
 *
 *   // app.config.ts
 *   providers: [provideAnalytics({ apiKey: "...", host: "..." })]
 *
 *   constructor(private analytics: AnalyticsService) {}
 *   this.analytics.track("invoice_downloaded");
 *
 * Implemented without @angular/core decorators so this package has no hard
 * Angular dependency; provideAnalytics returns a standard provider object
 * compatible with Angular 15+ standalone APIs.
 */
import { Analytics, type AnalyticsOptions } from "../core/analytics.js";

export class AnalyticsService {
  private client: Analytics;

  constructor(options: AnalyticsOptions) {
    this.client = Analytics.init(options);
  }

  track(name: string, properties?: Record<string, unknown>) { this.client.track(name, properties); }
  page(name?: string, properties?: Record<string, unknown>) { this.client.page(name, properties); }
  identify(userId: string, traits?: Record<string, unknown>) { this.client.identify(userId, traits); }
  register(props: Record<string, unknown>) { this.client.register(props); }
  reset() { this.client.reset(); }
  flush() { return this.client.flush(); }

  /** Call from an APP_INITIALIZER or root component to auto-track route changes. */
  connectRouter(router: { events: { subscribe(cb: (e: unknown) => void): void } }, isNavigationEnd: (e: unknown) => boolean, urlOf: (e: unknown) => string) {
    router.events.subscribe((e) => {
      if (isNavigationEnd(e)) this.page(undefined, { path: urlOf(e) });
    });
  }
}

/** Framework-standard provider factory for standalone Angular apps. */
export function provideAnalytics(options: AnalyticsOptions) {
  return { provide: AnalyticsService, useFactory: () => new AnalyticsService(options) };
}
