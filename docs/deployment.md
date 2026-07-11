# Deployment Guide

## 1. Local development

```bash
cp .env.example .env         # fill in ANTHROPIC_API_KEY at minimum
docker compose up            # postgres + migrations + api :4000 + dashboard :3000
```

Without Docker: run Postgres yourself, then `pnpm install && pnpm db:migrate && pnpm dev`.

## 2. Single-server production (Docker)

```bash
docker build -t ai-analytics .
docker run -d --env-file .env -p 4000:4000 ai-analytics
```

Put nginx/Caddy in front for TLS; serve `dashboard/dist` (from `pnpm --filter @ai-analytics/dashboard build`) as static files on the same domain to avoid CORS entirely.

## 3. Kubernetes

```bash
cp kubernetes/secrets.example.yaml kubernetes/secrets.yaml   # edit values (git-ignored)
kubectl apply -f kubernetes/secrets.yaml
kubectl apply -f kubernetes/api.yaml        # deployment + service + HPA + migrate initContainer
kubectl apply -f kubernetes/ingress.yaml    # TLS via cert-manager
```

Notes:

- Migrations run as an initContainer — pods only start on a migrated schema; concurrent starts are safe because all DDL is idempotent.
- The HPA scales 2→10 on CPU; ingestion is the elastic path. Session tracking state is in-memory per pod, which only affects session *boundaries* under rebalancing — acceptable for analytics. For exact sessions at scale, move `SessionTracker.live` to Redis (drop-in: it's keyed by user).
- Postgres: use a managed service (RDS/Cloud SQL) or a proper operator (CloudNativePG); this repo intentionally doesn't ship a toy in-cluster database for production.

## 4. CI/CD

`.github/workflows/ci.yml`:

1. **test** — typecheck + unit tests against a real Postgres service container, then verifies `database/migrate.mjs` applies cleanly from scratch.
2. **docker** — on main: build + push `ghcr.io/<repo>:latest` and `:sha`.

Extend for CD by adding a deploy job (e.g. `kubectl set image deployment/analytics-api api=ghcr.io/<repo>:${{ github.sha }}`) gated on environment approval.

## 5. Operations checklist

- [ ] `REFRESH MATERIALIZED VIEW CONCURRENTLY daily_event_counts` on a 5-min cron (K8s CronJob or pg_cron) — dashboards and anomaly detection read it.
- [ ] Monthly partition creation is handled by re-running `migrate.mjs` (add a monthly CronJob) — it always ensures current+next month.
- [ ] Backups: standard Postgres PITR; events are append-only so incremental backups are efficient.
- [ ] Monitoring: `/health` for liveness; alert on ingestion 5xx rate and on `events_default` growing (means partitions are missing).
- [ ] Budget guardrail: alert on Anthropic spend; the AI endpoints are the only variable cost.
