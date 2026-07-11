/** Molecule: KPI tile used across Overview and report headers. */
import { MetricValue, type MetricValueProps } from "../atoms/MetricValue.js";

export interface MetricCardProps extends MetricValueProps {
  label: string;
  hint?: string;
  loading?: boolean;
}

export function MetricCard({ label, hint, loading, ...metric }: MetricCardProps) {
  return (
    <div className="card metric-card" role="figure" aria-label={label}>
      <div className="metric-card__label">
        {label}
        {hint && <span className="metric-card__hint" title={hint}>ⓘ</span>}
      </div>
      {loading ? <div className="skeleton skeleton--metric" /> : <MetricValue {...metric} />}
    </div>
  );
}
