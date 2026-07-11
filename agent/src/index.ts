/**
 * @ai-analytics/agent — public API.
 *
 * `createAgent(config)` wires the whole platform from the single config file:
 * database, ingestion pipeline, engines, AI agent, plugins.
 */
export * from "./types.js";
export { validateEvent, normalizeEventName } from "./core/validator.js";
export { TaxonomyRegistry, classifyCategory } from "./core/taxonomy.js";
export { SessionTracker } from "./core/sessions.js";
export { IdentityService } from "./core/identity.js";
export { IngestionPipeline } from "./core/ingest.js";
export { FunnelEngine } from "./engines/funnels.js";
export { RetentionEngine } from "./engines/retention.js";
export { CohortEngine } from "./engines/cohorts.js";
export { SegmentationEngine } from "./engines/segmentation.js";
export { JourneyEngine } from "./engines/journeys.js";
export { AdoptionEngine } from "./engines/adoption.js";
export { ExperimentEngine } from "./engines/experiments.js";
export { AnomalyEngine, detectAnomalies } from "./engines/anomaly.js";
export { EngagementEngine, scoreUser } from "./engines/engagement.js";
export { AnthropicProvider } from "./ai/provider.js";
export { buildAnalyticsTools } from "./ai/tools.js";
export { InsightsAgent } from "./ai/insights.js";
export { PluginRegistry } from "./plugins/registry.js";
export type { AnalyticsPlugin, PluginContext } from "./plugins/plugin.js";
export { PostgresDatabase } from "./db/postgres.js";

import { PostgresDatabase } from "./db/postgres.js";
import { IngestionPipeline } from "./core/ingest.js";
import { AnthropicProvider } from "./ai/provider.js";
import { InsightsAgent } from "./ai/insights.js";
import { PluginRegistry } from "./plugins/registry.js";
import { AnomalyEngine } from "./engines/anomaly.js";
import { EngagementEngine } from "./engines/engagement.js";

export interface AgentBootConfig {
  projectName: string;
  database: { url: string; poolSize: number };
  ai: { apiKey: string; model: string; fastModel: string; maxTokens: number };
  taxonomy: { validationMode: "strict" | "warn"; autoRegister: boolean };
  sessions: { timeoutMinutes: number };
  promptsDir?: string;
}

export interface AnalyticsAgent {
  db: PostgresDatabase;
  projectId: string;
  ingestion: IngestionPipeline;
  insights: InsightsAgent;
  anomalies: AnomalyEngine;
  engagement: EngagementEngine;
  plugins: PluginRegistry;
}

/** Boot the platform: resolve project, build pipeline + AI agent. */
export async function createAgent(config: AgentBootConfig): Promise<AnalyticsAgent> {
  const db = new PostgresDatabase(config.database.url, config.database.poolSize);

  // Resolve (or create) the project row for this deployment.
  const rows = await db.query<{ id: string }>(
    `INSERT INTO projects (name) VALUES ($1)
     ON CONFLICT DO NOTHING RETURNING id`,
    [config.projectName]
  );
  const projectId =
    rows[0]?.id ??
    (await db.query<{ id: string }>(`SELECT id FROM projects WHERE name = $1`, [config.projectName]))[0]!.id;

  const ingestion = new IngestionPipeline(
    db, projectId,
    { validationMode: config.taxonomy.validationMode, autoRegister: config.taxonomy.autoRegister },
    config.sessions.timeoutMinutes
  );

  const ai = new AnthropicProvider(config.ai);
  const insights = new InsightsAgent(db, projectId, ai, {
    projectName: config.projectName,
    promptsDir: config.promptsDir,
  });

  return {
    db,
    projectId,
    ingestion,
    insights,
    anomalies: new AnomalyEngine(db, projectId),
    engagement: new EngagementEngine(db, projectId),
    plugins: new PluginRegistry(),
  };
}
