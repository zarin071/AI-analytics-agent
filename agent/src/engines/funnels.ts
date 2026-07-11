/**
 * Funnel analysis — ordered multi-step conversion within a time window.
 *
 * Implementation: window-function SQL that finds, per user, the earliest
 * timestamp of each step occurring AFTER the previous step and within the
 * conversion window of step 1. This matches Mixpanel's "ordered funnel"
 * semantics (steps may have other events interleaved).
 */
import type { Database, FunnelDefinition, FunnelResult } from "../types.js";
import { filtersToSql } from "./sql.js";

export class FunnelEngine {
  constructor(private db: Database, private projectId: string) {}

  async run(def: FunnelDefinition): Promise<FunnelResult> {
    if (def.steps.length < 2 || def.steps.length > 10) {
      throw new Error("Funnels require 2–10 steps");
    }
    const params: unknown[] = [this.projectId, def.range.from, def.range.to];
    const windowMs = def.conversionWindowHours * 3600 * 1000;

    // One CTE per step: earliest qualifying event per user after previous step.
    const ctes: string[] = [];
    for (let i = 0; i < def.steps.length; i++) {
      const step = def.steps[i]!;
      params.push(step.event);
      const eventParam = `$${params.length}`;
      const where = filtersToSql(step.where, params);
      if (i === 0) {
        ctes.push(`
          s0 AS (
            SELECT user_id, min(timestamp) AS ts
            FROM events
            WHERE project_id = $1 AND timestamp BETWEEN $2 AND $3
              AND name = ${eventParam} AND user_id IS NOT NULL ${where}
            GROUP BY user_id
          )`);
      } else {
        ctes.push(`
          s${i} AS (
            SELECT e.user_id, min(e.timestamp) AS ts
            FROM events e
            JOIN s${i - 1} p ON p.user_id = e.user_id
            JOIN s0 ON s0.user_id = e.user_id
            WHERE e.project_id = $1
              AND e.name = ${eventParam}
              AND e.timestamp > p.ts
              AND e.timestamp <= s0.ts + interval '${Math.floor(windowMs / 1000)} seconds' ${where}
            GROUP BY e.user_id
          )`);
      }
    }

    const selects = def.steps
      .map((_, i) => `(SELECT count(*) FROM s${i}) AS step_${i}`)
      .concat(
        def.steps.slice(1).map(
          (_, i) =>
            `(SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM n.ts - p.ts))
              FROM s${i + 1} n JOIN s${i} p ON p.user_id = n.user_id) AS median_${i + 1}`
        )
      );

    const rows = await this.db.query<Record<string, string>>(
      `WITH ${ctes.join(",")} SELECT ${selects.join(", ")}`,
      params
    );
    const row = rows[0] ?? {};

    const counts = def.steps.map((_, i) => Number(row[`step_${i}`] ?? 0));
    const steps = def.steps.map((s, i) => ({
      event: s.event,
      users: counts[i]!,
      conversionFromPrevious: i === 0 ? 1 : counts[i - 1]! ? counts[i]! / counts[i - 1]! : 0,
      conversionFromStart: counts[0]! ? counts[i]! / counts[0]! : 0,
      medianTimeToNextS: i < def.steps.length - 1 ? Number(row[`median_${i + 1}`] ?? 0) || undefined : undefined,
    }));

    return { steps, totalConversion: counts[0] ? counts.at(-1)! / counts[0] : 0 };
  }
}
