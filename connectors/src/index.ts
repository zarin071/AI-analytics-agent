/**
 * Connector registry — maps names in analytics.config.ts → plugin instances.
 * Adding a connector = add one import + one map entry; core never changes.
 */
import type { AnalyticsPlugin } from "@ai-analytics/agent";
import { slackConnector } from "./slack.js";
import { webhookConnector } from "./webhook.js";
import { bigqueryExportConnector } from "./bigquery-export.js";

export const CONNECTORS: Record<string, AnalyticsPlugin> = {
  slack: slackConnector,
  webhook: webhookConnector,
  "bigquery-export": bigqueryExportConnector,
};

export function resolveConnector(name: string): AnalyticsPlugin {
  const plugin = CONNECTORS[name];
  if (!plugin) {
    throw new Error(`Unknown connector "${name}". Available: ${Object.keys(CONNECTORS).join(", ")}`);
  }
  return plugin;
}
