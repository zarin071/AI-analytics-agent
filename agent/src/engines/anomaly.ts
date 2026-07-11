/**
 * Anomaly detection over daily metric series.
 *
 * Method: robust z-score against a trailing 28-day baseline that respects
 * day-of-week seasonality (compares Mondays to Mondays). Median/MAD instead
 * of mean/stddev so a single previous outlier doesn't mask new ones.
 *
 * Findings feed the AI agent (workflows/anomaly-watch.yaml) which explains
 * probable causes by correlating with releases, experiments, and segments.
 */
import type { AnomalyFinding, Database } from "../types.js";

export class AnomalyEngine {
  constructor(private db: Database, private projectId: string) {}

  /** Scan the top `topEvents` events by volume for anomalies in the last `days` days. */
  async scan(days = 7, topEvents = 25): Promise<AnomalyFinding[]> {
    const events = await this.db.query<{ name: string }>(
      `SELECT name FROM daily_event_counts
       WHERE project_id = $1 AND day > current_date - 30
       GROUP BY name ORDER BY sum(events) DESC LIMIT $2`,
      [this.projectId, topEvents]
    );

    const findings: AnomalyFinding[] = [];
    for (const { name } of events) {
      const series = await this.db.query<{ day: string; users: string }>(
        `SELECT day::text, users FROM daily_event_counts
         WHERE project_id = $1 AND name = $2 AND day > current_date - 60
         ORDER BY day`,
        [this.projectId, name]
      );
      const points = series.map((r) => ({ day: r.day, value: Number(r.users) }));
      findings.push(...detectAnomalies(name, points, days));
    }
    return findings.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
  }
}

export function detectAnomalies(
  metric: string,
  series: { day: string; value: number }[],
  lastNDays: number
): AnomalyFinding[] {
  const findings: AnomalyFinding[] = [];
  const recent = series.slice(-lastNDays);

  for (const point of recent) {
    const dow = new Date(point.day).getUTCDay();
    // Baseline: same weekday over the trailing 8 weeks, excluding the point itself.
    const baseline = series
      .filter((p) => p.day !== point.day && new Date(p.day).getUTCDay() === dow)
      .slice(-8)
      .map((p) => p.value);
    if (baseline.length < 3) continue;

    const med = median(baseline);
    const mad = median(baseline.map((v) => Math.abs(v - med))) || 1;
    const z = (0.6745 * (point.value - med)) / mad;      // 0.6745: MAD -> σ-consistent

    if (Math.abs(z) >= 3) {
      findings.push({
        metric: `users:${metric}`,
        day: point.day,
        observed: point.value,
        expected: Math.round(med),
        zScore: Number(z.toFixed(2)),
        direction: z > 0 ? "spike" : "drop",
        severity: Math.abs(z) >= 6 ? "critical" : Math.abs(z) >= 4 ? "warning" : "info",
      });
    }
  }
  return findings;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
