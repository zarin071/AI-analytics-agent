# AI Analytics Agent

A production-ready, **portable**, Mixpanel-class product analytics platform with a built-in AI agent.
Copy this repository into any project, edit **one file** (`analytics.config.ts`) and a `.env`, and everything else — ingestion, sessionization, funnels, retention, cohorts, AI insights, dashboard — works automatically.

```
Project → Analytics SDK → Analytics Agent → Analytics Database → Dashboard → AI Insights
```

## What it does

| Capability | Where |
|---|---|
| Event tracking, validation, naming standards, auto-taxonomy | `sdk/`, `agent/src/core/` |
| Sessions, user profiles, user/event properties | `agent/src/core/`, `database/` |
| Funnels, retention, cohorts, journeys, adoption, conversion | `agent/src/engines/` |
| Experiments, releases, segmentation, engagement, churn | `agent/src/engines/` |
| Anomaly detection, predictive analytics | `agent/src/engines/anomaly.ts`, `predict.ts` |
| AI insights, NL questions, executive summaries, custom reports | `agent/src/ai/`, `prompts/`, `workflows/` |
| Dashboard (Event Explorer, Funnels, Retention, AI Chat, …) | `dashboard/` |
| Connectors / plugin system (add without touching core) | `connectors/`, `agent/src/plugins/` |

## Quick start

```bash
cp .env.example .env          # 1. set DB url + AI key
pnpm install                  # 2. install workspace
pnpm db:migrate               # 3. apply database/schema.sql
pnpm dev                      # 4. api :4000, dashboard :3000
```

Then from your app:

```ts
import { Analytics } from "@ai-analytics/sdk";

const analytics = Analytics.init({ apiKey: "pk_...", host: "https://analytics.yourapp.com" });
analytics.identify("user_42", { plan: "pro" });
analytics.track("checkout_completed", { revenue: 49.0, currency: "USD" });
```

Ask the AI agent anything:

```bash
curl -X POST :4000/v1/ai/ask -H "authorization: Bearer sk_..." \
  -d '{"question": "Why did signups decrease last week?"}'
```

## Repository layout

```
analytics.config.ts   ← THE single configuration file
agent/                ← core analytics + AI agent (framework-agnostic TypeScript)
sdk/                  ← client SDKs: core + React/Next/Vue/Angular/Svelte/RN/Flutter/Node/Express/Fastify
database/             ← Postgres schema, migrations, ClickHouse option
api/                  ← Fastify HTTP API + OpenAPI spec
dashboard/            ← React dashboard (atomic design, design tokens, Storybook)
connectors/           ← pluggable destinations/sources (Slack, webhook, BigQuery, …)
prompts/              ← AI prompt library
workflows/            ← AI workflows (weekly report, anomaly watch, …)
docs/                 ← architecture, security, multi-tenancy, deployment, testing
examples/             ← integration examples
templates/            ← report / dashboard / event-schema templates
kubernetes/           ← K8s manifests; Dockerfile + docker-compose at root
```

## Design principles

- **Clean Architecture** — domain logic in `agent/src` has zero framework imports; API/dashboard are delivery mechanisms.
- **Domain-Driven Design** — bounded contexts: Ingestion, Identity, Analysis, Insight.
- **Atomic Design** — dashboard components: atoms → molecules → organisms → pages.
- **MCP-compatible modularity** — the AI agent exposes its analytics engines as tools; the same tool schemas can be served over MCP.
- **Extensible** — connectors and plugins register themselves; the core never changes.

## Documentation

Start with [`docs/architecture.md`](docs/architecture.md), then [`docs/deployment.md`](docs/deployment.md).
Full doc index in [`docs/README.md`](docs/README.md).

## License

MIT
