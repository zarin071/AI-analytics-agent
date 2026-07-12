/**
 * Plugin system — extend the platform WITHOUT modifying core.
 *
 * A plugin can hook into the event lifecycle, register connectors
 * (destinations/sources), add AI tools, and contribute scheduled jobs.
 * Connectors in /connectors are plugins that only implement `destination`.
 *
 * Registration is explicit (analytics.config.ts → connectors[]) so the
 * platform never loads code the operator didn't ask for.
 */
import type { StoredEvent, Database, Insight } from "../types.js";
import type { AiToolSpec } from "../ai/provider.js";

export interface PluginContext {
  db: Database;
  projectId: string;
  projectName: string;
  log: (msg: string, meta?: Record<string, unknown>) => void;
  options: Record<string, unknown>;
}

export interface AnalyticsPlugin {
  name: string;
  version: string;

  /** Called once at startup. */
  setup?(ctx: PluginContext): Promise<void> | void;

  /** Inspect/enrich/drop events before they are stored. Return null to drop. */
  beforeStore?(event: StoredEvent, ctx: PluginContext): Promise<StoredEvent | null> | StoredEvent | null;

  /** Fan-out after an event is stored (Slack alerts, warehouse export, …). */
  onEvent?(event: StoredEvent, ctx: PluginContext): Promise<void> | void;

  /** Receive AI insights as they are produced (post to Slack, email, …). */
  onInsight?(insight: Insight, ctx: PluginContext): Promise<void> | void;

  /** Extra tools for the AI agent (e.g. "query_zendesk_tickets"). */
  aiTools?(ctx: PluginContext): AiToolSpec[];

  /** Cron-style scheduled jobs: [{ schedule: "0 8 * * MON", run }] */
  jobs?(ctx: PluginContext): { schedule: string; name: string; run: () => Promise<void> }[];
}
