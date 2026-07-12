# Database Schema

Source of truth: [`database/schema.sql`](../database/schema.sql). Postgres 14+, multi-tenant via `project_id` on every row.

## Entity map

```
projects ──< api_keys
projects ──< user_profiles ──(anonymous_ids[])── identity_aliases
projects ──< events (partitioned monthly) >── sessions
projects ──< event_taxonomy
projects ──< cohorts ──< cohort_members
projects ──< saved_reports · experiments · releases · ai_insights · engagement_scores
daily_event_counts (materialized view over events)
```

## Design decisions

| Decision | Why |
|---|---|
| `events` partitioned by month (RANGE on timestamp) | cheap retention (`DROP TABLE`), partition pruning on every time-bounded query |
| JSONB `properties`/`context` + GIN indexes | schemaless event payloads with indexable ad-hoc filtering; engines extract via `#>>` paths |
| `event_taxonomy.property_schema` merged on ingest | zero-maintenance data dictionary; powers dashboard autocompletion and AI `list_events` |
| Profiles use `properties || EXCLUDED.properties` | $set semantics in one upsert, no read-modify-write races |
| `identity_aliases` + retroactive `UPDATE events` | pre-login activity stitches to the user at identify time |
| `valid` flag instead of dropping bad events | warn-mode observability; Data Quality panel and cleanup workflows |
| Keys stored as SHA-256 hashes | credential leak of the DB doesn't leak API keys |
| `ai_insights.evidence` JSONB | every AI claim auditable against the queries that produced it |
| `daily_event_counts` materialized view | dashboards + anomaly scans never scan raw events for trends |

## Query patterns the indexes serve

- `(project_id, name, timestamp)` — segmentation, funnels step CTEs, adoption
- `(project_id, user_id, timestamp)` — profiles' activity feed, retention entry, engagement features
- `(project_id, session_id)` — journeys, session detail
- GIN on `properties` — arbitrary property filters (`@>` and path extraction)

## Scaling path

1. **Vertical + partitions** (default) — fine into tens of millions of events/day on decent hardware because all hot queries prune to 1–2 partitions.
2. **Read replicas** — engines are read-only; point the query pool at replicas, keep ingest on primary.
3. **ClickHouse mirror** (`database/clickhouse.sql`) — a connector streams events to CH; funnels/retention move to the CH dialect adapter while Postgres keeps profiles, taxonomy, cohorts, AI artifacts. See docs/multi-tenancy.md for the tier table.

## Migrations

`database/migrate.mjs`: applies `schema.sql` (fully idempotent), then `migrations/*.sql` in order (tracked in `_migrations`), then ensures current+next monthly partitions. Runs as a K8s initContainer and in CI from scratch on every PR.
