# API Specification (overview)

The machine-readable contract is [`api/openapi.yaml`](../api/openapi.yaml); this page is the human summary.

Base URL: your deployment (dev: `http://localhost:4000`). Auth: `Authorization: Bearer <key>`.

## Key model

| Key | Prefix | Scope |
|---|---|---|
| Public | `pk_` | `/v1/track`, `/v1/identify` — write-only, safe in clients |
| Secret | `sk_` | everything — server-side only |

## Endpoints

### Ingestion (public key)
- `POST /v1/track` — `{ events: TrackedEvent[1..500] }` → `{ accepted, rejected[] }`. Batch; per-event validation results in warn mode, 422 if the whole batch is rejected in strict mode.
- `POST /v1/identify` — `{ userId, anonymousId?, traits? }` — aliases the device, sets profile traits, retro-stitches anonymous events.

### Query (secret key)
- `POST /v1/query/segment` — trends/breakdowns (events|users|sum|avg, groupBy property path)
- `POST /v1/query/funnel` — ordered funnel, 2–10 steps, conversion window
- `POST /v1/query/retention` — cohort triangle (day|week|month)
- `POST /v1/query/journeys` — Sankey paths from/to an anchor event
- `POST /v1/query/adoption` — feature adoption (rate, depth, stickiness)
- `GET /v1/taxonomy` — event catalog with inferred property schemas
- `GET /v1/users/:id`, `GET /v1/users/:id/events` — profile + activity feed

### Entities (secret key)
- `POST /v1/cohorts` — create + compute; `POST /v1/reports`, `GET /v1/reports` — saved reports/dashboards
- `POST /v1/experiments`, `GET /v1/experiments/:key/readout` — registration + significance readout
- `POST /v1/releases` — register releases (hook this from your deploy pipeline)

### AI (secret key)
- `POST /v1/ai/ask` — `{ question }` → grounded markdown insight
- `POST /v1/ai/summary` — `{ periodDays? }` → executive report
- `POST /v1/ai/recommend` — `{ area? }` → UX recommendations
- `POST /v1/ai/anomalies` — `{ days? }` → findings + AI explanation
- `GET /v1/insights` — recent insights feed

### Ops
- `GET /health` — unauthenticated liveness.

## Conventions

- Timestamps ISO-8601 UTC; ranges are `{ from, to }` inclusive.
- Property paths address JSONB: `properties.plan`, `context.device.os`.
- Errors: `{ error: string }` with conventional status codes (400 validation, 401 auth, 404 missing, 422 rejected batch, 429 rate limit).
- Rate limits: 1200 req/min default per key; ingestion batches count as one request (batch client-side — the SDKs do).
