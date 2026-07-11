/**
 * Experiment + release tracking.
 *
 * Experiments: events carry {experiment: {key, variant}} (stamped by the SDK).
 * The engine compares the primary metric conversion per variant with a
 * two-proportion z-test.
 *
 * Releases: registered via POST /v1/releases (or a git hook connector); the
 * engine compares metric levels before/after a release — the substrate for
 * "What changed after release 2.0?".
 */
import type { Database } from "../types.js";

export interface VariantStats { variant: string; exposed: number; converted: number; rate: number }
export interface ExperimentReadout {
  key: string; metric: string; variants: VariantStats[];
  /** z-score + p-value of best variant vs control (first variant). */
  zScore?: number; pValue?: number; significant: boolean;
}

export class ExperimentEngine {
  constructor(private db: Database, private projectId: string) {}

  async readout(key: string): Promise<ExperimentReadout> {
    const exp = (await this.db.query<{ key: string; primary_metric: string; variants: string[] }>(
      `SELECT key, primary_metric, variants FROM experiments WHERE project_id = $1 AND key = $2`,
      [this.projectId, key]
    ))[0];
    if (!exp) throw new Error(`Unknown experiment: ${key}`);

    const rows = await this.db.query<{ variant: string; exposed: string; converted: string }>(
      `WITH exposed AS (
         SELECT experiment->>'variant' AS variant, user_id, min(timestamp) AS first_exposed
         FROM events
         WHERE project_id = $1 AND experiment->>'key' = $2 AND user_id IS NOT NULL
         GROUP BY 1, 2
       )
       SELECT x.variant,
              count(DISTINCT x.user_id) AS exposed,
              count(DISTINCT c.user_id) AS converted
       FROM exposed x
       LEFT JOIN events c ON c.project_id = $1 AND c.user_id = x.user_id
             AND c.name = $3 AND c.timestamp >= x.first_exposed
       GROUP BY x.variant ORDER BY x.variant`,
      [this.projectId, key, exp.primary_metric]
    );

    const variants: VariantStats[] = rows.map((r) => ({
      variant: r.variant,
      exposed: Number(r.exposed),
      converted: Number(r.converted),
      rate: Number(r.exposed) ? Number(r.converted) / Number(r.exposed) : 0,
    }));

    let zScore: number | undefined, pValue: number | undefined;
    if (variants.length >= 2) {
      const [a, b] = [variants[0]!, variants.slice(1).sort((x, y) => y.rate - x.rate)[0]!];
      const pooled = (a.converted + b.converted) / (a.exposed + b.exposed || 1);
      const se = Math.sqrt(pooled * (1 - pooled) * (1 / (a.exposed || 1) + 1 / (b.exposed || 1)));
      zScore = se ? (b.rate - a.rate) / se : 0;
      pValue = 2 * (1 - normalCdf(Math.abs(zScore)));
    }
    return { key, metric: exp.primary_metric, variants, zScore, pValue, significant: (pValue ?? 1) < 0.05 };
  }

  /** Compare per-day metric levels before/after a release (± windowDays). */
  async releaseImpact(version: string, metricEvent: string, windowDays = 14) {
    const rel = (await this.db.query<{ released_at: string }>(
      `SELECT released_at FROM releases WHERE project_id = $1 AND version = $2`,
      [this.projectId, version]
    ))[0];
    if (!rel) throw new Error(`Unknown release: ${version}`);

    const rows = await this.db.query<{ phase: string; daily_users: string; daily_events: string }>(
      `SELECT CASE WHEN timestamp < $3::timestamptz THEN 'before' ELSE 'after' END AS phase,
              count(DISTINCT user_id)::float / GREATEST($4::int, 1) AS daily_users,
              count(*)::float / GREATEST($4::int, 1)               AS daily_events
       FROM events
       WHERE project_id = $1 AND name = $2
         AND timestamp BETWEEN $3::timestamptz - ($4 || ' days')::interval
                           AND $3::timestamptz + ($4 || ' days')::interval
       GROUP BY 1`,
      [this.projectId, metricEvent, rel.released_at, windowDays]
    );
    const get = (phase: string) => rows.find((r) => r.phase === phase);
    const before = Number(get("before")?.daily_events ?? 0);
    const after = Number(get("after")?.daily_events ?? 0);
    return {
      version,
      metric: metricEvent,
      releasedAt: rel.released_at,
      dailyEventsBefore: before,
      dailyEventsAfter: after,
      change: before ? (after - before) / before : null,
    };
  }
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26 approximation
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 1 - p;
}
