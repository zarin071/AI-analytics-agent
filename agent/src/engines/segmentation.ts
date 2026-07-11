/**
 * Segmentation — the "Insights" query: measure an event over time, optionally
 * grouped by a property and filtered. Powers Event Explorer + custom reports.
 */
import type { Database, SegmentationQuery } from "../types.js";
import { filtersToSql, propertyExpr, INTERVAL_TRUNC } from "./sql.js";

export interface SegmentationRow { bucket: string; group: string | null; value: number }

export class SegmentationEngine {
  constructor(private db: Database, private projectId: string) {}

  async run(q: SegmentationQuery): Promise<SegmentationRow[]> {
    const trunc = INTERVAL_TRUNC[q.interval];
    if (!trunc) throw new Error(`Unsupported interval: ${q.interval}`);

    const params: unknown[] = [this.projectId, q.event, q.range.from, q.range.to];
    const where = filtersToSql(q.where, params);
    const groupExpr = q.groupBy ? propertyExpr(q.groupBy) : "NULL";

    let measure: string;
    switch (q.measure) {
      case "events": measure = "count(*)"; break;
      case "users":  measure = "count(DISTINCT user_id)"; break;
      case "sum":    measure = `sum((${propertyExpr(q.measureProperty!)})::numeric)`; break;
      case "avg":    measure = `avg((${propertyExpr(q.measureProperty!)})::numeric)`; break;
    }

    const rows = await this.db.query<{ bucket: string; grp: string | null; value: string }>(
      `SELECT date_trunc('${trunc}', timestamp)::text AS bucket,
              ${groupExpr} AS grp,
              ${measure} AS value
       FROM events
       WHERE project_id = $1 AND name = $2 AND timestamp BETWEEN $3 AND $4 ${where}
       GROUP BY 1, 2 ORDER BY 1, 3 DESC`,
      params
    );
    return rows.map((r) => ({ bucket: r.bucket, group: r.grp, value: Number(r.value) }));
  }
}
