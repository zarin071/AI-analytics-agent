# AI Analytics Agent

A production-ready, **portable**, Mixpanel-class product analytics platform with a built-in AI agent.
Copy this repository into any project, edit **one file** (`analytics.config.ts`) and a `.env`, and everything else — ingestion, sessionization, funnels, retention, cohorts, AI insights, dashboard — works automatically.

```
Project → Analytics SDK → Analytics Agent → Analytics Database → Dashboard → AI Insights
```

---

## Table of contents

1. [What you get](#1-what-you-get)
2. [Setup in 5 minutes](#2-setup-in-5-minutes)
3. [Configuration — the only file you edit](#3-configuration--the-only-file-you-edit)
4. [Tracking events from your app](#4-tracking-events-from-your-app)
5. [Identifying users](#5-identifying-users)
6. [Naming events (the standard)](#6-naming-events-the-standard)
7. [Asking the AI agent questions](#7-asking-the-ai-agent-questions)
8. [Querying analytics directly (API)](#8-querying-analytics-directly-api)
9. [Experiments & releases](#9-experiments--releases)
10. [The dashboard](#10-the-dashboard)
11. [Connectors & scheduled AI workflows](#11-connectors--scheduled-ai-workflows)
12. [Deploying to production](#12-deploying-to-production)
13. [Integration walkthroughs: GitHub Pages & local development](#13-integration-walkthroughs-github-pages--local-development)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. What you get

| Capability | Where it lives |
|---|---|
| Event tracking, validation, naming standard, auto-taxonomy | `sdk/`, `agent/src/core/` |
| Sessions, user profiles, identity stitching | `agent/src/core/` |
| Funnels, retention, cohorts, journeys, adoption, conversion | `agent/src/engines/` |
| Experiments, release impact, segmentation, engagement, churn prediction | `agent/src/engines/` |
| Anomaly detection + AI root-cause analysis | `agent/src/engines/anomaly.ts`, `agent/src/ai/` |
| Natural-language questions, executive reports, UX recommendations | `agent/src/ai/`, `prompts/` |
| Dashboard (Event Explorer, Funnels, Retention, AI Chat, …) | `dashboard/` |
| Slack / webhook / BigQuery connectors, plugin system | `connectors/` |

The AI agent answers with numbers it **actually queried** — it calls the same analytics engines the dashboard uses, and every insight is stored with its query evidence.

---

## 2. Setup in 5 minutes

**Prerequisites:** Node 20+, pnpm 9, PostgreSQL 14+ (or just Docker), an [Anthropic API key](https://platform.claude.com).

### Option A — Docker (recommended first run)

```bash
git clone <this repo> && cd AI-analytics-agent
cp .env.example .env        # edit: set ANTHROPIC_API_KEY (everything else has dev defaults)
docker compose up
```

That starts Postgres, applies migrations, and serves:

- **API** → http://localhost:4000 (health check: `/health`)
- **Dashboard** → http://localhost:3000

### Option B — bare metal

```bash
cp .env.example .env        # set ANALYTICS_DATABASE_URL + ANTHROPIC_API_KEY
pnpm install
pnpm db:migrate             # applies database/schema.sql + migrations + partitions
pnpm dev                    # api :4000 + dashboard :3000
```

### Smoke test

```bash
# 1. Send an event (public key from .env)
curl -X POST localhost:4000/v1/track \
  -H "authorization: Bearer pk_local_dev_public" -H "content-type: application/json" \
  -d '{"events":[{"name":"user_signed_up","userId":"u1","timestamp":"'$(date -u +%FT%TZ)'","properties":{"plan":"free"},"context":{}}]}'

# 2. Ask the AI about it (secret key)
curl -X POST localhost:4000/v1/ai/ask \
  -H "authorization: Bearer sk_local_dev_secret" -H "content-type: application/json" \
  -d '{"question":"How many users signed up today?"}'
```

---

## 3. Configuration — the only file you edit

Everything derives from **`analytics.config.ts`** + the env vars it reads (`.env.example` lists them all):

| Setting | Env var | Notes |
|---|---|---|
| Project name | `ANALYTICS_PROJECT_NAME` | Shown in dashboard + AI reports |
| Database | `ANALYTICS_DATABASE_URL` | Postgres connection string |
| Auth — secret keys | `ANALYTICS_SECRET_KEYS` | `sk_…`, server-side, full access (comma-separated) |
| Auth — public keys | `ANALYTICS_PUBLIC_KEYS` | `pk_…`, embed in clients, **write-only** |
| Auth — JWT secret | `ANALYTICS_JWT_SECRET` | Dashboard sessions |
| AI provider | `ANTHROPIC_API_KEY` | plus optional `ANALYTICS_AI_MODEL` (default `claude-opus-4-8`) |
| Environment | `NODE_ENV` | development / staging / production |

Defaults you rarely touch (session timeout 30 min, validation mode `warn`, ports) are in the same file, clearly separated. **Never** put a `sk_` key in browser code — public keys can only write events.

---

## 4. Tracking events from your app

Install once: `pnpm add @ai-analytics/sdk` (or point your workspace at `sdk/`). Every adapter shares the same core: automatic batching (25 events / 5s), retry with backoff, offline queue persistence, and flush on page hide.

### React

```tsx
import { AnalyticsProvider, useAnalytics, usePageView } from "@ai-analytics/sdk/react";

// main.tsx
<AnalyticsProvider options={{ apiKey: "pk_...", host: "https://analytics.yourapp.com" }}>
  <App />
</AnalyticsProvider>;

// any component
const analytics = useAnalytics();
usePageView("pricing");
analytics.track("plan_selected", { plan: "pro", price: 49 });
```

### Next.js (App Router)

```tsx
// client: same provider as React, plus automatic route tracking
import { AnalyticsProvider, NextPageTracker } from "@ai-analytics/sdk/nextjs";

// server (Route Handlers / Server Actions):
import { serverAnalytics } from "@ai-analytics/sdk/nextjs";
serverAnalytics().track("checkout_completed", { revenue: 49 }, { userId });
```

### Vue 3

```ts
import { createAnalytics, useAnalytics } from "@ai-analytics/sdk/vue";
app.use(createAnalytics({ apiKey: "pk_...", host: "...", router })); // router → auto page views
useAnalytics().track("report_exported");
```

### Angular

```ts
import { provideAnalytics, AnalyticsService } from "@ai-analytics/sdk/angular";
providers: [provideAnalytics({ apiKey: "pk_...", host: "..." })];
constructor(private analytics: AnalyticsService) {}
this.analytics.track("invoice_downloaded");
```

### Svelte / SvelteKit

```ts
import { initAnalytics, analytics, trackPage } from "@ai-analytics/sdk/svelte";
initAnalytics({ apiKey: "pk_...", host: "..." });   // +layout.svelte
$analytics.track("theme_changed", { theme: "dark" });
afterNavigate(({ to }) => trackPage(to.url.pathname));
```

### React Native

```tsx
import { AnalyticsProvider, createAsyncStorageAdapter, rnContext } from "@ai-analytics/sdk/react-native";
const storage = await createAsyncStorageAdapter(AsyncStorage);
<AnalyticsProvider options={{ apiKey, host, storage, defaultContext: rnContext({ os: "ios" }) }} />;
```

### Flutter

```dart
final analytics = await AiAnalytics.init(apiKey: 'pk_...', host: 'https://...');
analytics.screen('Pricing');
analytics.track('checkout_completed', properties: {'revenue': 49.0});
```

### Node.js / Express / Fastify (server-side — use for the events that matter)

```ts
// Node
import { NodeAnalytics } from "@ai-analytics/sdk/node";
const analytics = new NodeAnalytics({ apiKey: process.env.ANALYTICS_SECRET_KEY!, host });
analytics.track("subscription_started", { plan: "pro", revenue: 49 }, { userId: "u1" });

// Express
app.use(analyticsMiddleware({ apiKey, host, getUserId: (req) => req.user?.id }));
req.analytics.track("api_key_created");

// Fastify
await app.register(analyticsPlugin, { apiKey, host, getUserId: (req) => req.user?.id });
```

Full examples: [`examples/react-app.md`](examples/react-app.md), [`examples/node-service.md`](examples/node-service.md).

---

## 5. Identifying users

```ts
// Before login: events carry an auto-generated anonymousId.
analytics.track("pricing_viewed");

// At login/signup — links the device to your user id and sets profile traits:
analytics.identify("user_42", { plan: "pro", company_size: 120 });
// → all *previous* anonymous events from this device are retroactively stitched to user_42

analytics.register({ app_area: "admin" });   // super properties: merged into every event
analytics.reset();                            // at logout: new anonymous identity
```

Profiles live in the `user_profiles` table and are visible in the dashboard's **User Profiles** page and to the AI agent.

---

## 6. Naming events (the standard)

Format: **`object_action`** — lowercase snake_case, past-tense action.

✓ `user_signed_up` · `checkout_completed` · `report_exported`
✗ `click` · `Signup` · `page-view` · `didTapButton`

You don't have to be perfect: the server auto-normalizes (`CheckoutCompleted` → `checkout_completed`, original kept in `$original_name`) and every event is auto-registered in the **taxonomy** with its category and inferred property schema. Violations are flagged (default `warn` mode) or rejected (`strict` mode) — and a weekly AI workflow suggests renames and duplicate merges. See [`docs/event-taxonomy.md`](docs/event-taxonomy.md) for property conventions and a recommended starter taxonomy.

---

## 7. Asking the AI agent questions

The AI agent is the headline feature. Ask in plain language — it maps your words to real events, runs the real engines, and answers with evidence.

### From the dashboard
Open **AI Chat** (or ⌘K → "Ask AI"). Suggested prompts are one click.

### From the API

```bash
SK=sk_...  HOST=https://analytics.yourapp.com

curl -X POST $HOST/v1/ai/ask -H "authorization: Bearer $SK" -H "content-type: application/json" \
  -d '{"question": "Why did signups decrease last week?"}'
```

Things it handles well:

| You ask | It does |
|---|---|
| "Why did signups decrease?" | trend → segment breakdown → correlates releases/experiments → funnel step diagnosis |
| "Show users who abandoned checkout." | funnel drop-off → user list with churn-risk context |
| "What changed after release 2.0?" | before/after metric comparison around the registered release |
| "Generate a weekly executive report." | full scorecard report (also available as `POST /v1/ai/summary`) |
| "Recommend UX improvements." | funnel drop-offs + journey detours + adoption gaps → ranked, sized recommendations |

Other AI endpoints:

```bash
POST /v1/ai/summary    {"periodDays": 7}      # executive report
POST /v1/ai/recommend  {"area": "onboarding"} # grounded UX recommendations
POST /v1/ai/anomalies  {"days": 7}            # detect + explain anomalies
GET  /v1/insights                             # feed of stored insights (with evidence)
```

Every insight is persisted to `ai_insights` with the queries that produced it — auditable, and delivered to Slack if the connector is on. More examples: [`examples/ai-questions.md`](examples/ai-questions.md).

---

## 8. Querying analytics directly (API)

All query endpoints take a secret key. Full contract: [`api/openapi.yaml`](api/openapi.yaml).

```bash
# Trend: daily unique users of an event, broken down by plan
curl -X POST $HOST/v1/query/segment -H "authorization: Bearer $SK" -d '{
  "event": "checkout_completed", "measure": "users", "interval": "day",
  "groupBy": "properties.plan",
  "range": {"from": "2026-06-01T00:00:00Z", "to": "2026-07-01T00:00:00Z"}}'

# Funnel: signup → onboarding → first value, 72h window
curl -X POST $HOST/v1/query/funnel -H "authorization: Bearer $SK" -d '{
  "steps": [{"event":"user_signed_up"},{"event":"onboarding_completed"},{"event":"report_created"}],
  "conversionWindowHours": 72,
  "range": {"from": "2026-06-01T00:00:00Z", "to": "2026-07-01T00:00:00Z"}}'

# Weekly retention triangle
curl -X POST $HOST/v1/query/retention -H "authorization: Bearer $SK" -d '{
  "cohortEvent": "user_signed_up", "returnEvent": "$any",
  "interval": "week", "periods": 8,
  "range": {"from": "2026-05-01T00:00:00Z", "to": "2026-07-01T00:00:00Z"}}'
```

Also: `/v1/query/journeys`, `/v1/query/adoption`, `/v1/taxonomy`, `/v1/users/:id`, `/v1/users/:id/events`, `/v1/cohorts`, `/v1/reports`.

---

## 9. Experiments & releases

```bash
# Register an experiment; the SDK stamps enrollment on events:
curl -X POST $HOST/v1/experiments -H "authorization: Bearer $SK" \
  -d '{"key":"new_onboarding","variants":["control","v2"],"primaryMetric":"onboarding_completed"}'
```
```ts
analytics.enrollExperiment("new_onboarding", "v2");   // client-side, after your assignment logic
```
```bash
# Readout with significance (two-proportion z-test):
curl $HOST/v1/experiments/new_onboarding/readout -H "authorization: Bearer $SK"

# Register releases from CI so "what changed after release X" works:
curl -X POST $HOST/v1/releases -H "authorization: Bearer $SK" \
  -d "{\"version\":\"$GIT_TAG\",\"notes\":\"$NOTES\"}"
```

---

## 10. The dashboard

http://localhost:3000 (dev). Pages: **Overview** (KPIs + AI briefing + anomalies), **Event Explorer**, **Funnels**, **Retention**, **Feature Adoption**, **User Profiles**, **Sessions**, **Journey Maps**, **Cohorts**, **Conversion**, **AI Chat**, **Saved Reports**, **Dashboard Builder**, **Settings** (keys, taxonomy governance, connectors, data quality).

Layouts for every page: [`docs/dashboard-wireframes.md`](docs/dashboard-wireframes.md). Component system + Storybook: [`docs/component-architecture.md`](docs/component-architecture.md) (`pnpm storybook`).

---

## 11. Connectors & scheduled AI workflows

Enable connectors in `analytics.config.ts` — no code changes:

```ts
connectors: [
  { name: "slack",   options: { webhookUrl: process.env.SLACK_WEBHOOK_URL } },        // AI insights → Slack
  { name: "webhook", options: { url: "https://…", secret: "…", events: ["checkout_completed"] } },
  { name: "bigquery-export", options: { projectId: "…", dataset: "analytics" } },
]
```

Scheduled AI workflows ship in [`workflows/`](workflows/): **weekly-executive-report** (Mondays → Slack), **anomaly-watch** (hourly, alerts on warning+), **taxonomy-review** (weekly hygiene). Add your own by copying a YAML.

Writing a custom connector (enrich, redact PII, alert, sync, add AI tools) is one file — see [`connectors/README.md`](connectors/README.md) and [`docs/plugin-system.md`](docs/plugin-system.md).

---

## 12. Deploying to production

Short version (full guide: [`docs/deployment.md`](docs/deployment.md)):

```bash
# Docker
docker build -t ai-analytics . && docker run -d --env-file .env -p 4000:4000 ai-analytics

# Kubernetes
cp kubernetes/secrets.example.yaml kubernetes/secrets.yaml   # edit values
kubectl apply -f kubernetes/secrets.yaml -f kubernetes/api.yaml -f kubernetes/ingress.yaml
```

Production checklist:

- [ ] Generate real keys (`sk_`/`pk_` random strings) and a strong `ANALYTICS_JWT_SECRET`
- [ ] Restrict `ANALYTICS_ALLOWED_ORIGINS` to your app's domains
- [ ] Managed Postgres with backups; cron `REFRESH MATERIALIZED VIEW CONCURRENTLY daily_event_counts` (5 min) and monthly `node database/migrate.mjs` (partitions)
- [ ] Hook `POST /v1/releases` into your deploy pipeline
- [ ] Alert on Anthropic spend (AI endpoints are the only variable cost)
- [ ] Read [`docs/security.md`](docs/security.md) — key handling, SQL sandboxing, PII, deletion

CI is included (`.github/workflows/ci.yml`): typecheck + tests against real Postgres + migration check on every PR, image publish on main.

---

## 13. Integration walkthroughs: GitHub Pages & local development

Two concrete, step-by-step setups: wiring this agent into a **static site hosted on GitHub Pages**, and into a **website running locally**. Both follow the same shape — run the agent's API somewhere reachable from the website, then drop the SDK snippet into the site's pages. The agent never crawls or auto-discovers anything; it only sees events the site actively sends it.

### 13.1 GitHub Pages (or any static site in a GitHub repo)

GitHub Pages only serves static files — it can't run the agent's API, Postgres, or AI layer. So the agent backend runs elsewhere, and only the tracking snippet ships to GitHub Pages.

**Step 1 — Deploy the agent backend somewhere reachable from the internet.**
Pick any host that can run a long-lived container + Postgres (GitHub Pages cannot): Render, Railway, Fly.io, a VPS, or your own Kubernetes cluster (`kubernetes/`).

```bash
docker build -t ai-analytics . && docker run -d --env-file .env -p 4000:4000 ai-analytics
```

Set in `.env` before deploying:
```
ANALYTICS_DATABASE_URL=postgres://...             # managed Postgres
ANALYTICS_PUBLIC_KEYS=pk_live_xxxxxxxx             # generate a real random key
ANALYTICS_SECRET_KEYS=sk_live_xxxxxxxx
ANALYTICS_JWT_SECRET=<random 32+ chars>
ANALYTICS_ALLOWED_ORIGINS=https://<your-username>.github.io
ANTHROPIC_API_KEY=sk-ant-...
```
`ANALYTICS_ALLOWED_ORIGINS` must match your Pages URL exactly (including a custom domain, if you use one) — the browser blocks the request otherwise.

Confirm it's reachable: `curl https://your-deployed-agent.com/health`

**Step 2 — Add the tracking snippet to the site in your GitHub repo.**

Plain HTML site — edit `index.html` (and any other page), before `</body>`:
```html
<script type="module">
  import { Analytics } from "https://cdn.jsdelivr.net/npm/@ai-analytics/sdk";
  const analytics = Analytics.init({
    apiKey: "pk_live_xxxxxxxx",              // public key — safe to expose, write-only
    host: "https://your-deployed-agent.com",
  });
  analytics.page();
  document.querySelectorAll("[data-track]").forEach((el) =>
    el.addEventListener("click", () => analytics.track(el.dataset.track))
  );
</script>
```
Tag elements you care about, e.g. `<a href="/resume.pdf" data-track="resume_downloaded">`.

React / Next.js / Vue / Astro static export — install `@ai-analytics/sdk` and use the matching adapter (§4) instead, then build as usual; GitHub Pages just serves the built output. The public key is safe to bake into the client bundle.

**Step 3 — Commit and push.**
```bash
git add index.html && git commit -m "Add analytics tracking" && git push
```
GitHub Pages redeploys automatically (or your Pages Actions workflow runs).

**Step 4 — Verify.** Visit your live GitHub Pages URL, click around, then check **Event Explorer** in the agent's dashboard for the incoming events.

**Step 5 — Ask the AI.**
```bash
curl -X POST https://your-deployed-agent.com/v1/ai/ask \
  -H "authorization: Bearer sk_live_xxxxxxxx" -H "content-type: application/json" \
  -d '{"question":"Which pages get the most traffic and what is my resume download rate?"}'
```

### 13.2 A website running locally (localhost dev server)

Here everything runs on one machine — no deployment needed.

**Step 1 — Start the agent locally.**
```bash
git clone <this repo> && cd AI-analytics-agent
cp .env.example .env        # set ANTHROPIC_API_KEY, defaults are fine for the rest
docker compose up
```
This gives you API → `http://localhost:4000`, dashboard → `http://localhost:3000`, using the dev keys `pk_local_dev_public` / `sk_local_dev_secret` already in `.env.example`.

**Step 2 — Serve your local website and note its origin.**
E.g. `npx http-server ./my-site -p 5500` → origin is `http://localhost:5500`. Serve it, don't open it via `file://` — `file://` origins are unreliable for CORS/fetch.

**Step 3 — Allow that origin.** In the agent's `.env`:
```
ANALYTICS_ALLOWED_ORIGINS=http://localhost:5500
```
Restart the agent (`docker compose restart api`, or re-run `pnpm dev`) after changing this.

**Step 4 — Add the snippet to your local site**, pointing at the local API:
```html
<script type="module">
  import { Analytics } from "@ai-analytics/sdk"; // or the CDN URL if not using a bundler
  const analytics = Analytics.init({
    apiKey: "pk_local_dev_public",
    host: "http://localhost:4000",
    debug: true,                 // logs each tracked event to the console
  });
  analytics.page();
</script>
```

**Step 5 — Browse the site, then verify.** Open `http://localhost:5500`, click around, then check `http://localhost:3000` → **Event Explorer**.

**Step 6 — Ask the AI.**
```bash
curl -X POST localhost:4000/v1/ai/ask \
  -H "authorization: Bearer sk_local_dev_secret" -H "content-type: application/json" \
  -d '{"question":"How many page views did I get and which page has the most clicks?"}'
```

### 13.3 Quick reference

| Scenario | Agent runs | Website's `host` points at | CORS origin to allow |
|---|---|---|---|
| GitHub Pages site | Render/Railway/Fly/VPS/K8s | `https://your-deployed-agent.com` | `https://<user>.github.io` (or custom domain) |
| Local website | `docker compose up` on your machine | `http://localhost:4000` | `http://localhost:<your-dev-port>` |

---

## 14. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `401 invalid or missing API key` | Wrong key type: `/v1/track` accepts pk_ or sk_; query/AI endpoints need sk_. Header must be `Authorization: Bearer <key>`. |
| Events accepted but missing in queries | They're in a different time range, or flagged invalid — check Settings → Data Quality, or `SELECT * FROM events WHERE valid = false`. |
| Event names look wrong in the dashboard | Auto-normalization (see §6); original preserved in `$original_name`. Fix the name at the call site. |
| AI says "no data for that event" | Ask it to `list events` first, or check `/v1/taxonomy` — your wording may not match any tracked event. |
| AI endpoints 500 | `ANTHROPIC_API_KEY` missing/invalid, or provider timeout — check API logs. |
| Dashboard trends empty but events exist | `daily_event_counts` view needs refreshing (see deployment checklist). |
| Browser events lost on tab close | Expected losses are rare (sendBeacon flush); verify your `pk_` key and CORS origins. |
| `events_default` partition growing | Monthly partitions missing — run `node database/migrate.mjs` (or add the monthly cron). |

---

**Docs index:** [`docs/README.md`](docs/README.md) · **License:** MIT
