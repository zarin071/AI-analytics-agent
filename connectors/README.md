# Connectors

Connectors are **plugins** (see `agent/src/plugins/plugin.ts`) that move data in or out of the platform — without any change to the core system.

## Enabling a connector

Add it to `analytics.config.ts`:

```ts
connectors: [
  { name: "slack", options: { webhookUrl: process.env.SLACK_WEBHOOK_URL, channel: "#analytics" } },
  { name: "webhook", options: { url: "https://example.com/hooks/analytics", events: ["checkout_completed"] } },
  { name: "bigquery-export", options: { dataset: "analytics", batchSize: 500 } },
]
```

The API server resolves each `name` against the registry in `src/index.ts` and registers it with the `PluginRegistry`. Unknown names fail fast at boot.

## Writing your own

1. Create `src/my-connector.ts` exporting an `AnalyticsPlugin`.
2. Add it to the registry map in `src/index.ts`.
3. Reference it from `analytics.config.ts`.

The hook surface: `setup`, `beforeStore` (enrich/drop), `onEvent` (fan-out), `onInsight` (deliver AI output), `aiTools` (extend the AI agent), `jobs` (cron). A connector that only implements `onEvent` is a classic *destination*; one that implements `jobs` + writes events via the ingestion pipeline is a *source*.

## Included connectors

| Connector | Hooks | Purpose |
|---|---|---|
| `slack` | `onInsight`, `onEvent` | Post AI insights + optional event alerts to Slack |
| `webhook` | `onEvent` | Forward selected events to any HTTPS endpoint (HMAC-signed) |
| `bigquery-export` | `onEvent`, `jobs` | Batch-export events to BigQuery for warehouse joins |
