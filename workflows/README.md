# AI Workflows

Declarative, scheduled AI jobs. Each workflow names a trigger, the steps to run (analytics engines and/or AI agent methods), and where the output goes (connectors). The API server's scheduler (or any external cron hitting the HTTP API) executes them.

```
trigger (cron | anomaly | webhook)
   → gather (engine queries)
   → reason (AI agent + prompt)
   → deliver (connectors: slack, email, webhook, dashboard feed)
```

| Workflow | Trigger | Output |
|---|---|---|
| `weekly-executive-report.yaml` | Mondays 08:00 | Slack + saved insight |
| `anomaly-watch.yaml` | hourly | Slack alert when severity ≥ warning |
| `taxonomy-review.yaml` | weekly | Insight with rename/dedupe suggestions |

Workflows are plain YAML so they can be reviewed in PRs and ported between deployments. Add a new one: copy a file, change the steps — no code changes needed unless you introduce a new step `kind`.
