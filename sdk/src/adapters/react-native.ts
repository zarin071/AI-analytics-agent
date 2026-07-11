/**
 * React Native adapter.
 *
 * Reuses the React provider/hooks; injects an AsyncStorage-backed storage
 * adapter (write-through memory cache, since the core storage API is sync)
 * and device context.
 *
 *   const storage = await createAsyncStorageAdapter(AsyncStorage);
 *   <AnalyticsProvider options={{ apiKey, host, storage, defaultContext: rnContext() }}>
 */
export { AnalyticsProvider, useAnalytics, useTrackOnMount } from "./react.js";

import type { StorageAdapter } from "../core/analytics.js";

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: readonly string[]): Promise<readonly [string, string | null][]>;
}

/** Preloads existing keys, then serves reads from memory and writes through. */
export async function createAsyncStorageAdapter(asyncStorage: AsyncStorageLike): Promise<StorageAdapter> {
  const cache = new Map<string, string>();
  const keys = (await asyncStorage.getAllKeys()).filter((k) => k.startsWith("aa_"));
  for (const [k, v] of await asyncStorage.multiGet(keys)) if (v != null) cache.set(k, v);
  return {
    get: (k) => cache.get(k) ?? null,
    set: (k, v) => { cache.set(k, v); void asyncStorage.setItem(k, v); },
  };
}

/** Device context for RN — pass values from react-native / expo-device. */
export function rnContext(info: { os: string; osVersion?: string; model?: string; appVersion?: string }) {
  return { device: { type: "mobile", os: info.os, model: info.model }, app: { version: info.appVersion } };
}
