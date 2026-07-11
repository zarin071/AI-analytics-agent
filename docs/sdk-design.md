# SDK Design

## Core (`sdk/src/core/analytics.ts`)

One framework-free, isomorphic client; every framework adapter is a thin veneer. Environment specifics are injected:

| Concern | Injection point | Browser default | Node/RN |
|---|---|---|---|
| Persistence | `StorageAdapter` | localStorage | none / AsyncStorage write-through |
| HTTP | `fetchImpl` | global fetch | global fetch (Node 18+) |
| Context | `defaultContext` + auto page/UTM/locale | collected | supplied by adapter |

### Delivery semantics

- **Batching**: queue flushes every 5s or at 25 events, whichever first.
- **Retry**: 5xx/429/network → batch is requeued (bounded queue, oldest dropped past 1000); 4xx → dropped (would never succeed).
- **Offline**: queue persisted (first 200 events) and restored on init.
- **Page exit**: `visibilitychange → hidden` flushes via `sendBeacon` (auth via query param since beacons can't set headers).
- **At-least-once** overall; server-side dedup is possible on `events.id` if ever needed.

### Identity model

`anonymousId` (generated, persisted) → `identify(userId, traits)` sends a `$identify` pseudo-event that aliases the device server-side and retro-stitches prior anonymous events. `reset()` on logout rotates the anonymous id. Super properties (`register`) merge into every event; `enrollExperiment(key, variant)` stamps experiment context.

## Adapters (`sdk/src/adapters/`, `sdk/flutter/`)

| Platform | Import | Shape |
|---|---|---|
| React | `@ai-analytics/sdk/react` | `<AnalyticsProvider>`, `useAnalytics`, `useTrackOnMount`, `usePageView` |
| Next.js | `…/nextjs` | re-exports React + `<NextPageTracker/>` (App Router) + `serverAnalytics()` for Route Handlers/Actions |
| Vue 3 | `…/vue` | `app.use(createAnalytics({ router }))`, `useAnalytics()` composable, auto page tracking |
| Angular | `…/angular` | `provideAnalytics(options)` + injectable `AnalyticsService` + router hookup |
| Svelte(Kit) | `…/svelte` | `initAnalytics()`, `$analytics` store, `trackPage()` for afterNavigate |
| React Native | `…/react-native` | React provider + `createAsyncStorageAdapter`, `rnContext()` |
| Node.js | `…/node` | `NodeAnalytics` — explicit `{userId}` per call, stateless |
| Express | `…/express` | `analyticsMiddleware({ getUserId })` → `req.analytics.track(...)` |
| Fastify | `…/fastify` | `app.register(analyticsPlugin, { getUserId })` → `req.analytics` |
| Flutter | `sdk/flutter/analytics_sdk.dart` | `AiAnalytics.init()` — same queue/retry/persistence semantics in Dart |

Design rules for adapters:

1. **No logic in adapters** — batching/retry/identity live in core only (the Dart port mirrors core exactly).
2. **Peer deps optional** — importing the core never pulls React/Vue/Svelte; adapters are separate export paths, tree-shaken.
3. **Server adapters take explicit ids** — no ambient identity on servers; `getUserId(req)` is the app's one integration point.

## Naming

SDKs pass event names through as written; the server normalizes to `object_action` and records `$original_name`. Teams get the standard without client releases being a compliance bottleneck.
