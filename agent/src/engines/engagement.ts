/**
 * Engagement scoring + churn detection (predictive).
 *
 * Engagement score (0–100) per user per day, computed from recency,
 * frequency, breadth (distinct events), and session depth — an RFM-style
 * composite that is transparent and explainable (features stored alongside).
 *
 * Churn risk: logistic curve over score decay. Not a black box: risk is
 * driven by "days since last seen" relative to the user's own historical
 * cadence, which outperforms global cutoffs for products with weekly users.
 */
import type { Database } from "../types.js";

export interface UserEngagement {
  userId: string;
  score: number;          // 0..100
  churnRisk: number;      // 0..1
  features: { daysSinceLast: number; eventsLast30: number; distinctEvents30: number; sessions30: number; medianGapDays: number };
}

export class EngagementEngine {
  constructor(private db: Database, private projectId: string) {}

  /** Compute and persist scores for all users active in the last 90 days. */
  async computeAll(): Promise<number> {
    const rows = await this.db.query<{
      user_id: string; days_since_last: string; events_30: string;
      distinct_30: string; sessions_30: string; median_gap: string;
    }>(
      `WITH activity AS (
         SELECT user_id,
                extract(epoch FROM now() - max(timestamp)) / 86400            AS days_since_last,
                count(*) FILTER (WHERE timestamp > now() - interval '30 days') AS events_30,
                count(DISTINCT name) FILTER (WHERE timestamp > now() - interval '30 days') AS distinct_30,
                count(DISTINCT session_id) FILTER (WHERE timestamp > now() - interval '30 days') AS sessions_30
         FROM events
         WHERE project_id = $1 AND user_id IS NOT NULL
           AND timestamp > now() - interval '90 days'
         GROUP BY user_id
       ),
       gaps AS (
         SELECT user_id, coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY gap), 7) AS median_gap
         FROM (
           SELECT user_id,
                  extract(epoch FROM timestamp - lag(timestamp) OVER (PARTITION BY user_id ORDER BY timestamp)) / 86400 AS gap
           FROM (SELECT DISTINCT user_id, date_trunc('day', timestamp) AS timestamp
                 FROM events WHERE project_id = $1 AND user_id IS NOT NULL
                   AND timestamp > now() - interval '90 days') d
         ) g WHERE gap IS NOT NULL AND gap > 0
         GROUP BY user_id
       )
       SELECT a.user_id, a.days_since_last, a.events_30, a.distinct_30, a.sessions_30,
              coalesce(g.median_gap, 7) AS median_gap
       FROM activity a LEFT JOIN gaps g USING (user_id)`,
      [this.projectId]
    );

    for (const r of rows) {
      const e = scoreUser({
        daysSinceLast: Number(r.days_since_last),
        eventsLast30: Number(r.events_30),
        distinctEvents30: Number(r.distinct_30),
        sessions30: Number(r.sessions_30),
        medianGapDays: Number(r.median_gap),
      });
      await this.db.query(
        `INSERT INTO engagement_scores (project_id, user_id, day, score, churn_risk, features)
         VALUES ($1, $2, current_date, $3, $4, $5)
         ON CONFLICT (project_id, user_id, day)
         DO UPDATE SET score = EXCLUDED.score, churn_risk = EXCLUDED.churn_risk, features = EXCLUDED.features`,
        [this.projectId, r.user_id, e.score, e.churnRisk, JSON.stringify(e.features)]
      );
    }
    return rows.length;
  }

  /** Users above a churn-risk threshold — feeds cohorts + AI recommendations. */
  async atRisk(threshold = 0.7, limit = 100) {
    return this.db.query(
      `SELECT user_id AS "userId", score, churn_risk AS "churnRisk", features
       FROM engagement_scores
       WHERE project_id = $1 AND day = (SELECT max(day) FROM engagement_scores WHERE project_id = $1)
         AND churn_risk >= $2
       ORDER BY churn_risk DESC LIMIT $3`,
      [this.projectId, threshold, limit]
    );
  }
}

export function scoreUser(f: UserEngagement["features"]): Omit<UserEngagement, "userId"> {
  // Component scores, each 0..1
  const recency = Math.exp(-f.daysSinceLast / Math.max(f.medianGapDays * 2, 1));
  const frequency = Math.min(f.sessions30 / 20, 1);
  const breadth = Math.min(f.distinctEvents30 / 10, 1);
  const volume = Math.min(Math.log10(1 + f.eventsLast30) / 3, 1);

  const score = Math.round(100 * (0.4 * recency + 0.25 * frequency + 0.2 * breadth + 0.15 * volume));

  // Churn: how overdue is the user relative to their own cadence?
  const overdue = f.daysSinceLast / Math.max(f.medianGapDays, 0.5);
  const churnRisk = Number((1 / (1 + Math.exp(-(overdue - 3)))).toFixed(3)); // ~0.5 at 3x cadence

  return { score, churnRisk, features: f };
}
