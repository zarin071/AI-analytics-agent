# Plugin System & MCP Compatibility

## Why plugins

The core system (ingest → store → analyze → insight) is closed for modification, open for extension. Everything project-specific — destinations, alerting, enrichment, extra AI capabilities — lives in plugins so upgrading the core is always a clean pull.

## The contract

`agent/src/plugins/plugin.ts`:

```ts
interface AnalyticsPlugin {
  name: string; version: string;
  setup?(ctx)                        // boot
  beforeStore?(event, ctx)           // enrich / redact / drop (return null)
  onEvent?(event, ctx)               // fan-out after persist (async, isolated)
  onInsight?(insight, ctx)           // deliver AI output
  aiTools?(ctx): AiToolSpec[]        // extend the AI agent
  jobs?(ctx): {schedule, name, run}[]// cron work
}
```

Guarantees the registry provides:

- **Isolation** — a throwing plugin is logged and skipped; it cannot fail ingestion or other plugins.
- **Ordering** — `beforeStore` runs in registration order (config order); `onEvent`/`onInsight` are unordered fire-and-forget.
- **No core edits** — new connectors are one file + one registry map entry (`connectors/src/index.ts`) + one config line.

## Typical plugins

| Need | Hook | Example |
|---|---|---|
| Strip PII (IP, emails) | `beforeStore` | delete `event.context.ip` |
| Alert on key events | `onEvent` | Slack "⚡ enterprise_plan_purchased" |
| Warehouse sync | `onEvent` + `jobs` | `bigquery-export` |
| Support context for AI | `aiTools` | `query_zendesk_tickets` tool |
| Nightly rollups | `jobs` | refresh materialized views |

## MCP compatibility

The AI agent's tools are plain JSON Schema + async run functions (`AiToolSpec`). This is deliberately isomorphic to MCP tool definitions:

- **Serving**: an MCP server can expose `buildAnalyticsTools(db, projectId)` one-to-one — `name`, `description`, `inputSchema` map directly to MCP `tools/list`, and `run` to `tools/call`. That lets any MCP client (Claude Code, desktop clients, other agents) query your product analytics conversationally with zero new code paths.
- **Consuming**: a plugin's `aiTools()` can proxy a remote MCP server's tools into the insights agent, giving it context beyond analytics (tickets, deploys, docs).

The rule that keeps this clean: **tool schemas are the public interface of the Analysis context**. Dashboard, HTTP API, AI agent, and MCP are four consumers of the same engine surface.
