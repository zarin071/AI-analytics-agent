# AI Workflow

## How a question becomes an answer

```
"Why did signups decrease?"
        │
        ▼
POST /v1/ai/ask ──▶ InsightsAgent.ask()
        │             system prompt: prompts/system.md
        ▼
AnthropicProvider.runAgent()          model: claude-opus-4-8, adaptive thinking
        │   SDK tool runner loop:
        │   ┌─────────────────────────────────────────────┐
        │   │ 1. list_events        → maps "signups" to    │
        │   │                        "user_signed_up"      │
        │   │ 2. segment            → confirms the drop,   │
        │   │                        finds it started Tue  │
        │   │ 3. segment groupBy    → isolated to Android  │
        │   │    context.device.os                         │
        │   │ 4. release_impact     → correlates with      │
        │   │    v2.3.1 Android release Tue                │
        │   │ 5. run_funnel         → drop is at the OTP   │
        │   │                        verification step     │
        │   └─────────────────────────────────────────────┘
        ▼
Markdown insight (answer → evidence → actions)
        │
        ├──▶ stored in ai_insights (auditable, with evidence)
        └──▶ PluginRegistry.onInsight → Slack, email, …
```

Grounding is structural, not aspirational: the model has **no way** to produce figures except through tools, `run_sql` is read-only/tenant-scoped, and the stored insight keeps the evidence for audit.

## Model usage

| Task | Model | Why |
|---|---|---|
| NL questions, anomaly RCA, recommendations, reports | `claude-opus-4-8` (config `ai.model`) | multi-step tool reasoning quality |
| Taxonomy review, category classification | `claude-haiku-4-5` (config `ai.fastModel`) | mechanical, high-volume, cheap |

Long outputs (executive summaries) use streaming with `finalMessage()`; agentic runs use the SDK tool runner with adaptive thinking. Provider is swappable behind `AiProvider` (one adapter file).

## Scheduled workflows

Declared in `/workflows/*.yaml` (trigger → steps → deliver). The three shipped:

1. **weekly-executive-report** — Monday 08:00, `executiveSummary(7)` → Slack + insight feed.
2. **anomaly-watch** — hourly `AnomalyEngine.scan(2)`; if findings ≥ warning, `explainAnomalies()` → Slack.
3. **taxonomy-review** — weekly fast-model hygiene pass over the event catalog.

## Cost control

- Tool results are truncated to 40KB each; `run_sql` capped at 200 rows.
- The agent is instructed to prefer aggregated tools over raw SQL.
- Anomaly explanation only triggers above `info` severity.
- Meter `/v1/ai/*` per project for quotas (see docs/multi-tenancy.md).

## Extending the agent

- New analytical capability → add an engine + one entry in `agent/src/ai/tools.ts`.
- External context (support tickets, deploy logs) → plugin `aiTools()`.
- New scheduled report → new YAML in `/workflows` + optionally a prompt file.
