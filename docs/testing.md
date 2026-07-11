# Testing Strategy

## Layers

| Layer | What | How | Where |
|---|---|---|---|
| Unit (pure) | validator, taxonomy classifier, anomaly math, engagement scoring | vitest, no I/O | `agent/test/*.test.ts` |
| Engine SQL | funnels/retention/cohorts produce correct numbers | vitest + real Postgres (CI service container), seeded fixtures | `agent/test/engines/` (add per engine) |
| API contract | routes ↔ openapi.yaml, auth boundaries (pk vs sk) | fastify `.inject()`, no network | `api/test/` |
| SDK | queue/retry/offline, identity persistence | vitest with mocked fetch + fake timers | `sdk/test/` |
| AI evals | agent answers grounded, correct tool selection | scripted questions against a seeded DB, assert tool-call traces + spot-check numbers appear in the answer | `agent/test/evals/` (run nightly, not per-PR — costs tokens) |

## Principles

1. **The math is unit-tested; SQL is integration-tested.** Anything expressible as a pure function (z-scores, scoring, name normalization) is extracted and tested without a database — see `detectAnomalies` and `scoreUser`.
2. **Engines get golden datasets.** Seed a small deterministic event set where the correct funnel/retention numbers are hand-computable; assert exact values. This catches SQL regressions that types can't.
3. **AI tests assert grounding, not prose.** Never string-match model output. Assert: (a) the expected tools were called, (b) the key figures from tool results appear in the answer, (c) `run_sql` rejections work (send a mutation attempt).
4. **Auth is tested negatively.** Every secret-key route gets a test proving a public key is rejected (401).

## Running

```bash
pnpm test                      # all workspace unit tests
pnpm --filter @ai-analytics/agent test
ANALYTICS_DATABASE_URL=... pnpm test   # enables the Postgres-backed suites
```

CI runs the full suite with a Postgres service container plus a from-scratch migration check on every PR (`.github/workflows/ci.yml`).
