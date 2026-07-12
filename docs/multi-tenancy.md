# Multi-Tenant Architecture

The platform is single-tenant by default (one project per deployment) but multi-tenant by design — the same binary serves many projects when you need it.

## Isolation model: shared database, row-level tenancy

Every domain table carries `project_id`; every query in every engine binds it as the first parameter. The AI agent's tools are constructed per-project (`buildAnalyticsTools(db, projectId)`), so a tenant's model invocation physically cannot address another tenant's rows — the id is closed over, not model-supplied.

```
Request → api_keys.key_hash lookup → project_id → engines(project_id) → rows WHERE project_id = $1
```

### Hardening with Postgres RLS (recommended for serious multi-tenancy)

```sql
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON events
  USING (project_id = current_setting('app.project_id')::uuid);
```

Set `app.project_id` per connection in the pool's `onConnect`. Then even a bug in query construction cannot cross tenants. Apply to all `project_id` tables.

## Tenant lifecycle

- **Create**: insert a `projects` row + generate keys into `api_keys` (hash-only). No schema work.
- **Key rotation**: insert new key row, revoke old (`revoked_at`), roll clients.
- **Delete**: `DELETE FROM projects WHERE id=…` cascades api_keys; events/sessions cleanup by `project_id` (batched, partition-friendly).

## Scaling tiers

| Tier | Setup | When |
|---|---|---|
| 1. Row-level (default) | One Postgres, `project_id` everywhere | up to ~10M events/day total |
| 2. Partition-per-tenant | `events` LIST-partitioned by project_id, then RANGE by month | few large tenants dominating |
| 3. Database-per-tenant | One deployment, config maps project→DB URL | strict isolation/compliance |
| 4. ClickHouse mirror | Hot queries served from CH, Postgres remains system of record | >50M events/day |

The engines don't change across tiers — only the `Database` adapter and DDL.

## Noisy neighbors & quotas

- Per-key rate limits at the API (`@fastify/rate-limit` keyed by API key rather than IP for tenant fairness).
- AI usage is the real cost driver: meter `/v1/ai/*` calls per project (insert into a `usage_ledger`) and enforce plan quotas at the route level.
- Long queries: set `statement_timeout` (e.g. 15s) on the query pool; the dashboard degrades gracefully, and the AI agent treats timeouts as tool errors it can work around.
