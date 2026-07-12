/**
 * User journeys — what paths do users take from (or to) a given event?
 *
 * Produces a weighted transition graph (Sankey-ready) of the top event
 * sequences within sessions, up to `depth` steps.
 */
import type { Database, DateRange } from "../types.js";

export interface JourneyQuery {
  anchorEvent: string;
  direction: "forward" | "backward";
  depth: number;                      // 1..5
  range: DateRange;
  topN?: number;                      // branches kept per level (default 8)
}

export interface JourneyNode { step: number; event: string; users: number }
export interface JourneyEdge { fromStep: number; from: string; to: string; users: number }
export interface JourneyResult { nodes: JourneyNode[]; edges: JourneyEdge[] }

export class JourneyEngine {
  constructor(private db: Database, private projectId: string) {}

  async run(q: JourneyQuery): Promise<JourneyResult> {
    const depth = Math.min(Math.max(q.depth, 1), 5);
    const topN = q.topN ?? 8;
    const order = q.direction === "forward" ? "ASC" : "DESC";
    const cmp = q.direction === "forward" ? ">" : "<";

    // Sequence events within each session relative to the anchor occurrence.
    const rows = await this.db.query<{ path: string[]; users: string }>(
      `WITH anchored AS (
         SELECT session_id, user_id, min(timestamp) AS anchor_ts
         FROM events
         WHERE project_id = $1 AND name = $2 AND timestamp BETWEEN $3 AND $4
           AND session_id IS NOT NULL
         GROUP BY session_id, user_id
       ),
       seq AS (
         SELECT e.session_id, e.user_id, e.name,
                row_number() OVER (PARTITION BY e.session_id ORDER BY e.timestamp ${order}) AS rn
         FROM events e
         JOIN anchored a ON a.session_id = e.session_id
         WHERE e.project_id = $1 AND e.timestamp ${cmp} a.anchor_ts
       )
       SELECT array_agg(name ORDER BY rn) FILTER (WHERE rn <= ${depth}) AS path,
              count(DISTINCT user_id) AS users
       FROM seq
       GROUP BY session_id
       `,
      [this.projectId, q.anchorEvent, q.range.from, q.range.to]
    );

    // Aggregate paths into nodes + edges.
    const nodeCount = new Map<string, number>();
    const edgeCount = new Map<string, number>();
    for (const r of rows) {
      if (!r.path) continue;
      const users = Number(r.users);
      let prev = q.anchorEvent;
      r.path.slice(0, depth).forEach((event, i) => {
        const nodeKey = `${i + 1}|${event}`;
        nodeCount.set(nodeKey, (nodeCount.get(nodeKey) ?? 0) + users);
        const edgeKey = `${i}|${prev}→${event}`;
        edgeCount.set(edgeKey, (edgeCount.get(edgeKey) ?? 0) + users);
        prev = event;
      });
    }

    // Keep topN nodes per step.
    const byStep = new Map<number, [string, number][]>();
    for (const [key, users] of nodeCount) {
      const [stepStr, event] = key.split("|") as [string, string];
      const step = Number(stepStr);
      if (!byStep.has(step)) byStep.set(step, []);
      byStep.get(step)!.push([event, users]);
    }
    const nodes: JourneyNode[] = [{ step: 0, event: q.anchorEvent, users: rows.length }];
    const kept = new Set<string>([`0|${q.anchorEvent}`]);
    for (const [step, list] of byStep) {
      for (const [event, users] of list.sort((a, b) => b[1] - a[1]).slice(0, topN)) {
        nodes.push({ step, event, users });
        kept.add(`${step}|${event}`);
      }
    }
    const edges: JourneyEdge[] = [];
    for (const [key, users] of edgeCount) {
      const [stepStr, pair] = key.split("|") as [string, string];
      const [from, to] = pair.split("→") as [string, string];
      const fromStep = Number(stepStr);
      if (kept.has(`${fromStep}|${from}`) && kept.has(`${fromStep + 1}|${to}`)) {
        edges.push({ fromStep, from, to, users });
      }
    }
    return { nodes, edges };
  }
}
