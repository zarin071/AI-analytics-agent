/**
 * Analytics tools exposed to the AI agent.
 *
 * These are the SAME engines the dashboard uses — the model never invents
 * numbers; every claim in an insight is backed by a tool result. The tool
 * schemas below are MCP-compatible (plain JSON Schema) and can be re-served
 * over an MCP server without changes (see docs/plugin-system.md).
 *
 * `run_sql` is read-only and sandboxed: SELECT-only, single statement,
 * auto-scoped to the project, LIMIT-capped. See docs/security.md.
 */
import type { Database } from "../types.js";
import type { AiToolSpec } from "./provider.js";
import { FunnelEngine } from "../engines/funnels.js";
import { RetentionEngine } from "../engines/retention.js";
import { SegmentationEngine } from "../engines/segmentation.js";
import { JourneyEngine } from "../engines/journeys.js";
import { AdoptionEngine } from "../engines/adoption.js";
import { ExperimentEngine } from "../engines/experiments.js";
import { AnomalyEngine } from "../engines/anomaly.js";
import { EngagementEngine } from "../engines/engagement.js";
import { TaxonomyRegistry } from "../core/taxonomy.js";

const j = (v: unknown) => JSON.stringify(v, null, 2).slice(0, 40_000); // keep tool results bounded

const FORBIDDEN_SQL = /\b(insert|update|delete|drop|alter|create|grant|truncate|copy|vacuum|;)\b/i;

export function buildAnalyticsTools(db: Database, projectId: string): AiToolSpec[] {
  const funnels = new FunnelEngine(db, projectId);
  const retention = new RetentionEngine(db, projectId);
  const segmentation = new SegmentationEngine(db, projectId);
  const journeys = new JourneyEngine(db, projectId);
  const adoption = new AdoptionEngine(db, projectId);
  const experiments = new ExperimentEngine(db, projectId);
  const anomalies = new AnomalyEngine(db, projectId);
  const engagement = new EngagementEngine(db, projectId);
  const taxonomy = new TaxonomyRegistry(db, projectId);

  const range = { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] };

  return [
    {
      name: "list_events",
      description:
        "List the event taxonomy: every tracked event with its object/action, category, and property schema. " +
        "Call this FIRST to learn what data exists before running any analysis.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => j(await taxonomy.list()),
    },
    {
      name: "segment",
      description:
        "Measure an event over time (count of events or unique users; sum/avg of a numeric property), optionally grouped by a property path like 'properties.plan' or 'context.device.os'. Use for trends and breakdowns.",
      inputSchema: {
        type: "object",
        properties: {
          event: { type: "string" },
          range,
          interval: { enum: ["hour", "day", "week", "month"] },
          measure: { enum: ["events", "users", "sum", "avg"] },
          measureProperty: { type: "string" },
          groupBy: { type: "string" },
        },
        required: ["event", "range", "interval", "measure"],
      },
      run: async (input) => j(await segmentation.run(input)),
    },
    {
      name: "run_funnel",
      description:
        "Run an ordered conversion funnel of 2-10 event steps within a conversion window. Returns per-step users, step conversion, and median time between steps.",
      inputSchema: {
        type: "object",
        properties: {
          steps: { type: "array", items: { type: "object", properties: { event: { type: "string" } }, required: ["event"] } },
          range,
          conversionWindowHours: { type: "number" },
        },
        required: ["steps", "range", "conversionWindowHours"],
      },
      run: async (input) => j(await funnels.run(input)),
    },
    {
      name: "run_retention",
      description:
        "Cohort retention triangle: users entering on cohortEvent, returning with returnEvent ('$any' = any event), by day/week/month.",
      inputSchema: {
        type: "object",
        properties: {
          cohortEvent: { type: "string" },
          returnEvent: { type: "string" },
          range,
          interval: { enum: ["day", "week", "month"] },
          periods: { type: "number" },
        },
        required: ["cohortEvent", "returnEvent", "range", "interval", "periods"],
      },
      run: async (input) => j(await retention.run(input)),
    },
    {
      name: "user_journeys",
      description: "Top event paths users take forward from (or backward to) an anchor event, within sessions. Use to answer 'what do users do after/before X' and to find drop-off detours.",
      inputSchema: {
        type: "object",
        properties: {
          anchorEvent: { type: "string" },
          direction: { enum: ["forward", "backward"] },
          depth: { type: "number" },
          range,
        },
        required: ["anchorEvent", "direction", "depth", "range"],
      },
      run: async (input) => j(await journeys.run(input)),
    },
    {
      name: "feature_adoption",
      description: "Adoption metrics for a feature (list of its event names): adoption rate among active users, uses per user, stickiness (DAU/MAU).",
      inputSchema: {
        type: "object",
        properties: { featureEvents: { type: "array", items: { type: "string" } }, range },
        required: ["featureEvents", "range"],
      },
      run: async (input) => j(await adoption.adoption(input.featureEvents, input.range)),
    },
    {
      name: "experiment_readout",
      description: "Variant exposure, conversion on the primary metric, and statistical significance (two-proportion z-test) for a registered experiment key.",
      inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
      run: async (input) => j(await experiments.readout(input.key)),
    },
    {
      name: "release_impact",
      description: "Before/after comparison of a metric event around a registered release version. Use for 'what changed after release X'.",
      inputSchema: {
        type: "object",
        properties: { version: { type: "string" }, metricEvent: { type: "string" }, windowDays: { type: "number" } },
        required: ["version", "metricEvent"],
      },
      run: async (input) => j(await experiments.releaseImpact(input.version, input.metricEvent, input.windowDays)),
    },
    {
      name: "detect_anomalies",
      description: "Scan top events for statistically significant spikes/drops (day-of-week-aware robust z-score) over the last N days.",
      inputSchema: { type: "object", properties: { days: { type: "number" } } },
      run: async (input) => j(await anomalies.scan(input.days ?? 7)),
    },
    {
      name: "at_risk_users",
      description: "Users with high predicted churn risk, with the engagement features explaining the risk.",
      inputSchema: { type: "object", properties: { threshold: { type: "number" }, limit: { type: "number" } } },
      run: async (input) => j(await engagement.atRisk(input.threshold ?? 0.7, input.limit ?? 50)),
    },
    {
      name: "run_sql",
      description:
        "Escape hatch for questions the other tools can't express. Read-only single SELECT over tables: events, sessions, user_profiles, daily_event_counts, cohorts, cohort_members, experiments, releases. Always filter project_id = :project (pre-bound). Max 200 rows returned.",
      inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] },
      run: async (input) => {
        const sql = String(input.sql).trim();
        if (!/^select\s/i.test(sql) || FORBIDDEN_SQL.test(sql)) {
          return "REJECTED: only single read-only SELECT statements are allowed.";
        }
        const rows = await db.query(
          `SELECT * FROM (${sql.replace(/:project/g, "$1")}) q LIMIT 200`,
          [projectId]
        );
        return j(rows);
      },
    },
  ];
}
