/**
 * Cohorts — reusable user groups defined by behavior + properties.
 *
 * Dynamic cohorts are (re)computed on demand or on a schedule; static cohorts
 * snapshot the member list. Cohorts compose with every other engine (funnels,
 * retention, segmentation accept a cohortId filter via user_id IN (...)).
 */
import type { CohortDefinition, Database } from "../types.js";
import { filtersToSql } from "./sql.js";

export class CohortEngine {
  constructor(private db: Database, private projectId: string) {}

  /** Build the SQL returning matching user_ids for a definition. */
  buildSql(def: CohortDefinition, params: unknown[]): string {
    const parts: string[] = [];
    for (const c of def.conditions) {
      if (c.kind === "performed") {
        params.push(this.projectId, c.event, c.inLastDays, c.atLeast);
        parts.push(`
          SELECT user_id FROM events
          WHERE project_id = $${params.length - 3} AND name = $${params.length - 2}
            AND timestamp > now() - ($${params.length - 1} || ' days')::interval
            AND user_id IS NOT NULL
          GROUP BY user_id HAVING count(*) >= $${params.length}`);
      } else if (c.kind === "not_performed") {
        params.push(this.projectId, this.projectId, c.event, c.inLastDays);
        parts.push(`
          SELECT user_id FROM user_profiles
          WHERE project_id = $${params.length - 3} AND user_id NOT IN (
            SELECT user_id FROM events
            WHERE project_id = $${params.length - 2} AND name = $${params.length - 1}
              AND timestamp > now() - ($${params.length} || ' days')::interval
              AND user_id IS NOT NULL)`);
      } else {
        params.push(this.projectId);
        const p = params.length;
        const where = filtersToSql([{ ...c.filter, property: "properties." + c.filter.property.replace(/^user\./, "") }], params)
          .replace(/^ AND /, "");
        parts.push(`SELECT user_id FROM user_profiles WHERE project_id = $${p} AND ${where}`);
      }
    }
    return parts.map((p) => `(${p})`).join(" INTERSECT ");
  }

  async compute(cohortId: string, def: CohortDefinition): Promise<number> {
    const params: unknown[] = [];
    const sql = this.buildSql(def, params);
    const members = await this.db.query<{ user_id: string }>(sql, params);

    await this.db.query(`DELETE FROM cohort_members WHERE cohort_id = $1`, [cohortId]);
    for (const m of members) {
      await this.db.query(
        `INSERT INTO cohort_members (cohort_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [cohortId, m.user_id]
      );
    }
    await this.db.query(
      `UPDATE cohorts SET member_count = $2, computed_at = now() WHERE id = $1`,
      [cohortId, members.length]
    );
    return members.length;
  }
}
