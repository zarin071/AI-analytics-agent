/**
 * Svelte / SvelteKit adapter.
 *
 *   // +layout.svelte
 *   import { initAnalytics, analytics } from "@ai-analytics/sdk/svelte";
 *   initAnalytics({ apiKey, host });
 *
 *   $analytics.track("theme_changed", { theme: "dark" });
 *
 * SvelteKit page tracking: call trackPage($page.url.pathname) in an
 * afterNavigate hook.
 */
import { Analytics, type AnalyticsOptions } from "../core/analytics.js";

type Subscriber = (value: Analytics | null) => void;

/** Minimal readable-store implementation (no svelte import needed). */
function readable(initial: Analytics | null) {
  let value = initial;
  const subs = new Set<Subscriber>();
  return {
    subscribe(fn: Subscriber) { subs.add(fn); fn(value); return () => subs.delete(fn); },
    _set(v: Analytics | null) { value = v; subs.forEach((fn) => fn(v)); },
  };
}

const store = readable(null);
export const analytics = { subscribe: store.subscribe };

let client: Analytics | null = null;

export function initAnalytics(options: AnalyticsOptions): Analytics {
  if (!client) {
    client = Analytics.init(options);
    store._set(client);
  }
  return client;
}

export function getAnalytics(): Analytics {
  if (!client) throw new Error("Call initAnalytics() first (e.g. in +layout.svelte)");
  return client;
}

export function trackPage(path: string): void {
  getAnalytics().page(undefined, { path });
}
