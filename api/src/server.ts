/**
 * AI Analytics — HTTP API (Fastify).
 *
 * Delivery layer only (Clean Architecture): parses/authenticates requests
 * and delegates to @ai-analytics/agent. See api/openapi.yaml for the contract.
 *
 * Key groups:
 *   POST /v1/track            — event ingestion (public key)
 *   POST /v1/identify         — identity + profile traits (public key)
 *   GET/POST /v1/query/*      — funnels, retention, segmentation… (secret key)
 *   POST /v1/ai/*             — NL questions, summaries, recommendations (secret key)
 *   CRUD /v1/{cohorts,reports,experiments,releases,taxonomy} (secret key)
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createHash } from "node:crypto";
import config from "../../analytics.config.js";
import {
  createAgent,
  FunnelEngine, RetentionEngine, SegmentationEngine, JourneyEngine,
  AdoptionEngine, ExperimentEngine, CohortEngine,
} from "@ai-analytics/agent";

const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });
const agent = await createAgent({ ...config, promptsDir: new URL("../../prompts", import.meta.url).pathname });

await app.register(cors, { origin: config.auth.allowedOrigins });
await app.register(rateLimit, { max: 1200, timeWindow: "1 minute" });

// ── auth ─────────────────────────────────────────────────────────────────────

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const publicKeys = new Set(config.auth.publicKeys.map(sha256));
const secretKeys = new Set(config.auth.secretKeys.map(sha256));

function keyFrom(req: { headers: Record<string, unknown>; query: unknown }): string | null {
  const header = String(req.headers["authorization"] ?? "");
  if (header.startsWith("Bearer ")) return header.slice(7);
  const q = (req.query as Record<string, string>)?.key;   // sendBeacon fallback
  return q ?? null;
}

function requireKey(kind: "public" | "secret") {
  return async (req: any, reply: any) => {
    const key = keyFrom(req);
    const hash = key ? sha256(key) : "";
    const ok = kind === "public" ? publicKeys.has(hash) || secretKeys.has(hash) : secretKeys.has(hash);
    if (!ok) return reply.code(401).send({ error: "invalid or missing API key" });
  };
}

// ── ingestion ────────────────────────────────────────────────────────────────

app.post("/v1/track", { preHandler: requireKey("public") }, async (req, reply) => {
  const body = req.body as { events?: unknown[] };
  if (!Array.isArray(body?.events) || body.events.length === 0 || body.events.length > 500) {
    return reply.code(400).send({ error: "body must be { events: [1..500] }" });
  }
  // $identify pseudo-events route to the identity service.
  const events = body.events as any[];
  const identifies = events.filter((e) => e.name === "$identify");
  for (const id of identifies) {
    await agent.ingestion.identity.identify(id.userId, id.anonymousId, id.properties ?? {});
  }
  const outcome = await agent.ingestion.ingestBatch(events.filter((e) => e.name !== "$identify"));
  return reply.code(outcome.rejected.length && !outcome.accepted ? 422 : 200).send(outcome);
});

app.post("/v1/identify", { preHandler: requireKey("public") }, async (req) => {
  const { userId, anonymousId, traits } = req.body as any;
  await agent.ingestion.identity.identify(userId, anonymousId, traits ?? {});
  return { ok: true };
});

// ── query engines (secret key) ───────────────────────────────────────────────

const db = agent.db;
const pid = agent.projectId;

app.post("/v1/query/segment", { preHandler: requireKey("secret") }, async (req) =>
  new SegmentationEngine(db, pid).run(req.body as any));

app.post("/v1/query/funnel", { preHandler: requireKey("secret") }, async (req) =>
  new FunnelEngine(db, pid).run(req.body as any));

app.post("/v1/query/retention", { preHandler: requireKey("secret") }, async (req) =>
  new RetentionEngine(db, pid).run(req.body as any));

app.post("/v1/query/journeys", { preHandler: requireKey("secret") }, async (req) =>
  new JourneyEngine(db, pid).run(req.body as any));

app.post("/v1/query/adoption", { preHandler: requireKey("secret") }, async (req) => {
  const { featureEvents, range } = req.body as any;
  return new AdoptionEngine(db, pid).adoption(featureEvents, range);
});

app.get("/v1/taxonomy", { preHandler: requireKey("secret") }, async () =>
  agent.ingestion.taxonomy.list());

app.get("/v1/users/:userId", { preHandler: requireKey("secret") }, async (req, reply) => {
  const profile = await agent.ingestion.identity.getProfile((req.params as any).userId);
  return profile ?? reply.code(404).send({ error: "unknown user" });
});

app.get("/v1/users/:userId/events", { preHandler: requireKey("secret") }, async (req) =>
  db.query(
    `SELECT name, timestamp, properties, session_id FROM events
     WHERE project_id = $1 AND user_id = $2 ORDER BY timestamp DESC LIMIT 200`,
    [pid, (req.params as any).userId]
  ));

// ── entities ─────────────────────────────────────────────────────────────────

app.post("/v1/cohorts", { preHandler: requireKey("secret") }, async (req) => {
  const { name, definition } = req.body as any;
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO cohorts (project_id, name, definition) VALUES ($1, $2, $3) RETURNING id`,
    [pid, name, JSON.stringify(definition)]
  );
  const members = await new CohortEngine(db, pid).compute(row!.id, definition);
  return { id: row!.id, members };
});

app.post("/v1/releases", { preHandler: requireKey("secret") }, async (req) => {
  const { version, releasedAt, notes } = req.body as any;
  await db.query(
    `INSERT INTO releases (project_id, version, released_at, notes) VALUES ($1,$2,$3,$4)
     ON CONFLICT (project_id, version) DO UPDATE SET released_at = EXCLUDED.released_at, notes = EXCLUDED.notes`,
    [pid, version, releasedAt ?? new Date().toISOString(), notes ?? null]
  );
  return { ok: true };
});

app.post("/v1/experiments", { preHandler: requireKey("secret") }, async (req) => {
  const { key, hypothesis, variants, primaryMetric } = req.body as any;
  await db.query(
    `INSERT INTO experiments (project_id, key, hypothesis, variants, primary_metric, started_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (project_id, key) DO UPDATE SET hypothesis = EXCLUDED.hypothesis`,
    [pid, key, hypothesis ?? null, variants, primaryMetric ?? null]
  );
  return { ok: true };
});

app.get("/v1/experiments/:key/readout", { preHandler: requireKey("secret") }, async (req) =>
  new ExperimentEngine(db, pid).readout((req.params as any).key));

app.post("/v1/reports", { preHandler: requireKey("secret") }, async (req) => {
  const { kind, name, definition } = req.body as any;
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO saved_reports (project_id, kind, name, definition) VALUES ($1,$2,$3,$4) RETURNING id`,
    [pid, kind, name, JSON.stringify(definition)]
  );
  return { id: row!.id };
});

app.get("/v1/reports", { preHandler: requireKey("secret") }, async () =>
  db.query(`SELECT id, kind, name, definition, updated_at FROM saved_reports WHERE project_id = $1`, [pid]));

// ── AI ───────────────────────────────────────────────────────────────────────

app.post("/v1/ai/ask", { preHandler: requireKey("secret") }, async (req, reply) => {
  const { question } = req.body as { question?: string };
  if (!question?.trim()) return reply.code(400).send({ error: "question required" });
  return agent.insights.ask(question);
});

app.post("/v1/ai/summary", { preHandler: requireKey("secret") }, async (req) =>
  agent.insights.executiveSummary((req.body as any)?.periodDays ?? 7));

app.post("/v1/ai/recommend", { preHandler: requireKey("secret") }, async (req) =>
  agent.insights.recommend((req.body as any)?.area));

app.post("/v1/ai/anomalies", { preHandler: requireKey("secret") }, async (req) => {
  const findings = await agent.anomalies.scan((req.body as any)?.days ?? 7);
  if (!findings.length) return { findings, insight: null };
  const insight = await agent.insights.explainAnomalies(findings);
  return { findings, insight };
});

app.get("/v1/insights", { preHandler: requireKey("secret") }, async () =>
  db.query(`SELECT id, kind, question, body_md, severity, created_at
            FROM ai_insights WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`, [pid]));

// ── ops ──────────────────────────────────────────────────────────────────────

app.get("/health", async () => ({ ok: true, project: config.projectName }));

setInterval(() => void agent.ingestion.sessions.sweep(), 60_000);          // close idle sessions
setInterval(() => void agent.engagement.computeAll().catch(() => {}), 6 * 3600_000); // engagement/churn refresh

await app.listen({ port: config.api.port, host: config.api.host });
app.log.info(`analytics api on :${config.api.port} (project: ${config.projectName})`);
