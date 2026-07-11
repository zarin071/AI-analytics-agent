# System Architecture

## The pipeline

```
┌──────────────┐   HTTPS batch   ┌─────────────────────────────────────────────┐
│   Project    │ ──────────────▶ │                 Analytics API                │
│  (your app)  │                 │  auth → validate → identity → sessionize    │
│  + SDK       │                 │        → persist → plugins fan-out          │
└──────────────┘                 └───────────────┬─────────────────────────────┘
                                                 │
                                    ┌────────────▼───────────┐
                                    │   Analytics Database   │  Postgres (default)
                                    │  events · sessions ·   │  ClickHouse (scale-out)
                                    │  profiles · taxonomy   │
                                    └───────┬───────┬────────┘
                                            │       │
                        ┌───────────────────▼──┐  ┌─▼──────────────────────┐
                        │      Dashboard       │  │   Analytics Engines    │
                        │ funnels · retention  │  │ funnel · retention ·   │
                        │ explorer · AI chat   │  │ cohort · journey · …   │
                        └───────────▲──────────┘  └─▲──────────────────────┘
                                    │               │ used as TOOLS
                                    │        ┌──────┴─────────┐
                                    └────────│  AI Insights   │  Anthropic Claude
                                             │     Agent      │  (claude-opus-4-8)
                                             └────────────────┘
```

The AI agent is not a separate analytics system: it calls **the same engines the dashboard uses**, exposed as tool schemas. That is what makes its answers trustworthy — every number it reports came out of a real query.

## Bounded contexts (DDD)

| Context | Responsibility | Code |
|---|---|---|
| **Ingestion** | Accept, validate, normalize, sessionize, store events | `agent/src/core/` |
| **Identity** | Anonymous↔user resolution, profiles, traits | `agent/src/core/identity.ts` |
| **Analysis** | Funnels, retention, cohorts, journeys, adoption, experiments, anomalies, engagement | `agent/src/engines/` |
| **Insight** | NL answers, summaries, recommendations, reports | `agent/src/ai/`, `prompts/`, `workflows/` |

Contexts communicate only through the database and typed interfaces in `agent/src/types.ts` — there are no cross-context imports of internals.

## Clean Architecture layering

```
┌───────────────────────────────────────────────────────┐
│ Frameworks & drivers: Fastify (api/), React (dashboard/), pg, Anthropic SDK │
├───────────────────────────────────────────────────────┤
│ Interface adapters: api routes, dashboard/src/lib/api.ts, db/postgres.ts,  │
│                     ai/provider.ts (Anthropic adapter), connectors/         │
├───────────────────────────────────────────────────────┤
│ Use cases: IngestionPipeline, engines, InsightsAgent                        │
├───────────────────────────────────────────────────────┤
│ Entities: types.ts (TrackedEvent, FunnelDefinition, CohortDefinition, …)    │
└───────────────────────────────────────────────────────┘
```

Dependency rule: arrows point inward only. The engines depend on the `Database` **port** (an interface), not on `pg`; the InsightsAgent depends on the `AiProvider` port, not on the Anthropic SDK. Swapping Postgres→ClickHouse or adding another AI provider means writing one adapter.

## Portability

Dropping the platform into a new project requires exactly:

1. `analytics.config.ts` — project name, DB, auth keys, AI provider.
2. `.env` — the secrets referenced by the config.
3. `pnpm db:migrate && pnpm dev` (or `docker compose up`).

Nothing in `agent/`, `api/`, or `dashboard/` references any particular product; taxonomy is discovered from the events you send.

## Data flow guarantees

- **Ingestion is at-least-once**: SDKs retry with backoff and persist queues offline; the server deduplicates nothing by default (append-only), but `events.id` supports downstream dedup if a connector needs exactly-once.
- **Validation never loses data silently**: in `warn` mode invalid events are stored flagged (`valid=false`) and surfaced; in `strict` mode rejections are returned to the SDK per event.
- **Enrichment is off the hot path**: taxonomy registration and profile touches are fire-and-forget; ingest latency is one INSERT plus session assignment.
