/** Organism: cohort retention triangle heatmap. */
export interface RetentionGridProps {
  cohorts: { cohortDate: string; size: number; retention: number[] }[];
  interval: "day" | "week" | "month";
}

export function RetentionGrid({ cohorts, interval }: RetentionGridProps) {
  const periods = cohorts[0]?.retention.length ?? 0;
  return (
    <table className="retention-grid">
      <thead>
        <tr>
          <th>Cohort</th>
          <th>Size</th>
          {Array.from({ length: periods }, (_, i) => <th key={i}>{interval[0]!.toUpperCase()}{i}</th>)}
        </tr>
      </thead>
      <tbody>
        {cohorts.map((c) => (
          <tr key={c.cohortDate}>
            <td>{c.cohortDate.slice(0, 10)}</td>
            <td>{c.size.toLocaleString()}</td>
            {c.retention.map((r, i) => (
              <td
                key={i}
                className="retention-grid__cell"
                style={{ background: `color-mix(in srgb, var(--color-accent) ${Math.round(r * 100)}%, transparent)` }}
                title={`${(r * 100).toFixed(1)}%`}
              >
                {(r * 100).toFixed(0)}%
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
