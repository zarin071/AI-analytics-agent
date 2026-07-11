/**
 * BigQuery export connector — buffers events and streams them to BigQuery in
 * batches for warehouse-side joins with business data.
 *
 * Uses the REST insertAll endpoint with an access token supplied via options
 * (or ambient ADC in production), so the core has no GCP SDK dependency.
 *
 * options: {
 *   projectId: string; dataset: string; table?: string;   // default "events"
 *   accessToken?: () => Promise<string>;
 *   batchSize?: number;                                    // default 500
 * }
 */
import type { AnalyticsPlugin, StoredEvent, PluginContext } from "@ai-analytics/agent";

const buffers = new WeakMap<PluginContext, StoredEvent[]>();

async function flush(ctx: PluginContext): Promise<void> {
  const buffer = buffers.get(ctx) ?? [];
  if (!buffer.length) return;
  const batch = buffer.splice(0, buffer.length);

  const { projectId, dataset, table = "events", accessToken } = ctx.options as any;
  const token = accessToken ? await accessToken() : process.env.BIGQUERY_ACCESS_TOKEN;
  if (!projectId || !dataset || !token) {
    ctx.log("bigquery-export: missing projectId/dataset/token; dropping batch", { size: batch.length });
    return;
  }

  const res = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${dataset}/tables/${table}/insertAll`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        rows: batch.map((e) => ({
          insertId: e.id,
          json: {
            id: e.id, name: e.name, user_id: e.userId, anonymous_id: e.anonymousId,
            session_id: e.sessionId, timestamp: e.timestamp,
            properties: JSON.stringify(e.properties), context: JSON.stringify(e.context),
          },
        })),
      }),
    }
  );
  if (!res.ok) ctx.log(`bigquery-export failed: ${res.status}`, { size: batch.length });
}

export const bigqueryExportConnector: AnalyticsPlugin = {
  name: "bigquery-export",
  version: "1.0.0",

  setup(ctx) {
    buffers.set(ctx, []);
  },

  onEvent(event, ctx) {
    const buffer = buffers.get(ctx)!;
    buffer.push(event);
    const batchSize = Number((ctx.options as any).batchSize ?? 500);
    if (buffer.length >= batchSize) void flush(ctx);
  },

  jobs(ctx) {
    return [{ schedule: "* * * * *", name: "bigquery-flush", run: () => flush(ctx) }];
  },
};
