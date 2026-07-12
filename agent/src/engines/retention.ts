/**
 * Retention analysis — classic cohort triangle.
 *
 * Users enter a cohort in the period they first perform `cohortEvent`;
 * retention[i] is the share of that cohort performing `returnEvent`
 * ("$any" = any event) in period i after entry.
 */
import type { Database, RetentionDefinition, RetentionResult } from "../types.js";
import { INTERVAL_TRUNC } from "./sql.js";

export class RetentionEngine {
  constructor(private db: Database, private projectId: string) {}

  async run(def: RetentionDefinition): Promise<RetentionResult> {
    const trunc = INTERVAL_TRUNC[def.interval];
    if (!trunc) throw new Error(`Unsupported interval: ${def.interval}`);
    const periods = Math.min(Math.max(def.periods, 1), 24);

    const params: unknown[] = [this.projectId, def.range.from, def.range.to, def.cohortEvent];
    const returnFilter = def.returnEvent === "$any" ? "" : `AND name = $5`;
    if (def.returnEvent !== "$any") params.push(def.returnEvent);

    const rows = await this.db.query<{ cohort: string; period: number; users: string }>(
      `WITH cohort_entry AS (
         SELECT user_id, date_trunc('${trunc}', min(timestamp)) AS cohort
         FROM events
         WHERE project_id = $1 AND timestamp BETWEEN $2 AND $3
           AND name = $4 AND user_id IS NOT NULL
         GROUP BY user_id
       ),
       activity AS (
         SELECT DISTINCT e.user_id, c.cohort,
                floor(extract(epoch FROM date_trunc('${trunc}', e.timestamp) - c.cohort)
                      / extract(epoch FROM interval '1 ${trunc}'))::int AS period
         FROM events e
         JOIN cohort_entry c ON c.user_id = e.user_id
         WHERE e.project_id = $1 AND e.timestamp >= $2 ${returnFilter}
       )
       SELECT cohort::text AS cohort, period, count(DISTINCT user_id) AS users
       FROM activity
       WHERE period BETWEEN 0 AND ${periods}
       GROUP BY cohort, period
       ORDER BY cohort, period`,
      params
    );

    const byCohort = new Map<string, Map<number, number>>();
    for (const r of rows) {
      if (!byCohort.has(r.cohort)) byCohort.set(r.cohort, new Map());
      byCohort.get(r.cohort)!.set(Number(r.period), Number(r.users));
    }

    const cohorts = [...byCohort.entries()].map(([cohortDate, grid]) => {
      const size = grid.get(0) ?? 0;
      const retention = Array.from({ length: periods + 1 }, (_, i) =>
        size ? (grid.get(i) ?? 0) / size : 0
      );
      return { cohortDate, size, retention };
    });

    return { cohorts };
  }
}
