# Security Model

## Authentication & authorization

| Credential | Format | May call | Storage |
|---|---|---|---|
| Public key | `pk_*` | `/v1/track`, `/v1/identify` only | Embedded in clients — write-only by design |
| Secret key | `sk_*` | Everything | Server-side only; env/secret manager |
| Dashboard JWT | signed with `ANALYTICS_JWT_SECRET` | Dashboard session | httpOnly cookie |

- Keys are stored **hashed** (SHA-256) in `api_keys`; the raw key exists only at creation time and in the caller's env. Runtime auth compares hashes.
- A leaked public key allows event spam at worst (mitigate with rate limits + origin allowlist); it can never read data.
- CORS: ingestion honors `auth.allowedOrigins`; query/AI endpoints should never be called from browsers with secret keys — the dashboard talks to the API from its own backend session or a locked-down origin.

## SQL injection & the AI `run_sql` tool

Engines never interpolate user input into SQL: values are bound parameters, property paths are validated against `^[a-z$][a-zA-Z0-9_.]{0,128}$` and rendered via JSONB path arrays (`agent/src/engines/sql.ts`).

The AI agent's `run_sql` escape hatch is defense-in-depth sandboxed:

1. Single statement, must start with `SELECT`, keyword blocklist (`insert|update|delete|drop|…|;`).
2. Wrapped as a subquery with a forced `LIMIT 200`.
3. `project_id` pre-bound — the model cannot query another tenant.
4. **Recommended in production:** run the API's query pool as a Postgres role with `SELECT`-only grants on the analytics tables, so the database enforces what the code already promises.

## Prompt injection

Event names and properties are attacker-controllable (they come from clients) and they flow into AI tool results. Mitigations:

- Tool results are data, not instructions: the system prompts direct the model to treat tool output strictly as query results.
- The agent has **no write tools** — worst case, injected text distorts one report's prose, never data or infrastructure.
- Insights are rendered as markdown text in the dashboard (no HTML injection; the AiChat component renders text, not `dangerouslySetInnerHTML`).

## PII & data protection

- **Don't send what you don't need**: the SDK never auto-collects emails/names; profile traits are explicit `identify()` calls.
- IP is available in `context.ip` for geo enrichment — drop it in a `beforeStore` plugin if your policy requires (one-line connector).
- **Deletion (GDPR/CCPA)**: `DELETE FROM events WHERE project_id=$1 AND user_id=$2` plus `user_profiles`, `cohort_members`, `engagement_scores`. Ship as an admin endpoint before going to production in regulated markets.
- Retention: `database.eventRetentionDays` + monthly partitions make retention enforcement a cheap `DROP TABLE events_YYYY_MM`.
- AI provider: only aggregated query results and event *names* reach the model, not raw profile rows — unless a question explicitly requests user lists (e.g. "users who abandoned checkout" returns user ids). If ids are sensitive, pseudonymize at identify time.

## Transport & infrastructure

- TLS everywhere (ingress terminates; see `kubernetes/ingress.yaml`).
- Containers run as non-root (`Dockerfile`), minimal Alpine base, healthchecked.
- Secrets via K8s Secrets / external secret managers — never in images or the repo (`kubernetes/secrets.example.yaml` is a template).
- Rate limiting at the API (1200 req/min default) and at the ingress.
- Webhook connector signs payloads (HMAC-SHA256) so receivers can authenticate us.
