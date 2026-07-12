/**
 * Feature adoption + conversion tracking.
 *
 * A "feature" is a set of events (usually one) mapped in the taxonomy.
 * Adoption = share of active users who used the feature in a window,
 * with breadth (users), depth (uses/user) and stickiness (DAU/MAU of feature).
 *
 * Conversion tracking = 2-step goal funnels with a stored definition,
 * delegating to the FunnelEngine.
 */
import type { Database, DateRange } from "../types.js";
import { FunnelEngine } from "./funnels.js";

export interface AdoptionResult {
  feature: string;
  activeUsers: number;
  featureUsers: number;
  adoptionRate: number;      // featureUsers / activeUsers
  usesPerUser: number;
  stickiness: number;        // feature DAU / feature MAU
}

export class AdoptionEngine {
  constructor(private db: Database, private projectId: string) {}

  async adoption(featureEvents: string[], range: DateRange): Promise<AdoptionResult> {
    const rows = await this.db.query<Record<string, string>>(
      `WITH active AS (
         SELECT DISTINCT user_id FROM events
         WHERE project_id = $1 AND timestamp BETWEEN $2 AND $3 AND user_id IS NOT NULL
       ),
       feature AS (
         SELECT user_id, count(*) AS uses FROM events
         WHERE project_id = $1 AND timestamp BETWEEN $2 AND $3
           AND name = ANY($4) AND user_id IS NOT NULL
         GROUP BY user_id
       ),
       dau AS (
         SELECT date_trunc('day', timestamp) AS d, count(DISTINCT user_id) AS n
         FROM events
         WHERE project_id = $1 AND timestamp BETWEEN $2 AND $3 AND name = ANY($4)
         GROUP BY 1
       )
       SELECT (SELECT count(*) FROM active)                    AS active_users,
              (SELECT count(*) FROM feature)                   AS feature_users,
              (SELECT coalesce(sum(uses), 0) FROM feature)     AS total_uses,
              (SELECT coalesce(avg(n), 0) FROM dau)            AS avg_dau,
              (SELECT count(DISTINCT user_id) FROM events
               WHERE project_id = $1 AND timestamp BETWEEN $2 AND $3 AND name = ANY($4)) AS mau`,
      [this.projectId, range.from, range.to, featureEvents]
    );
    const r = rows[0] ?? {};
    const activeUsers = Number(r.active_users ?? 0);
    const featureUsers = Number(r.feature_users ?? 0);
    const mau = Number(r.mau ?? 0);
    return {
      feature: featureEvents.join("+"),
      activeUsers,
      featureUsers,
      adoptionRate: activeUsers ? featureUsers / activeUsers : 0,
      usesPerUser: featureUsers ? Number(r.total_uses ?? 0) / featureUsers : 0,
      stickiness: mau ? Number(r.avg_dau ?? 0) / mau : 0,
    };
  }

  /** Conversion goal: share of users doing `fromEvent` who reach `toEvent` within windowHours. */
  async conversion(fromEvent: string, toEvent: string, range: DateRange, windowHours = 72) {
    const funnel = new FunnelEngine(this.db, this.projectId);
    const result = await funnel.run({
      steps: [{ event: fromEvent }, { event: toEvent }],
      range,
      conversionWindowHours: windowHours,
    });
    return {
      from: fromEvent,
      to: toEvent,
      started: result.steps[0]!.users,
      converted: result.steps[1]!.users,
      rate: result.totalConversion,
      medianTimeS: result.steps[0]!.medianTimeToNextS,
    };
  }
}
