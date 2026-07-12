/** Atom: a formatted metric with delta indicator. */
export interface MetricValueProps {
  value: number;
  format?: "number" | "percent" | "currency" | "duration";
  delta?: number;                 // fractional change vs previous period
  invertDelta?: boolean;          // true when "down is good" (e.g. churn)
}

export function formatMetric(value: number, format: MetricValueProps["format"] = "number"): string {
  switch (format) {
    case "percent":  return `${(value * 100).toFixed(1)}%`;
    case "currency": return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
    case "duration": return value >= 3600 ? `${(value / 3600).toFixed(1)}h` : value >= 60 ? `${Math.round(value / 60)}m` : `${Math.round(value)}s`;
    default:         return new Intl.NumberFormat(undefined, { notation: value >= 10000 ? "compact" : "standard" }).format(value);
  }
}

export function MetricValue({ value, format, delta, invertDelta }: MetricValueProps) {
  const good = delta !== undefined && (invertDelta ? delta < 0 : delta > 0);
  return (
    <span className="metric-value">
      <span className="metric-value__number">{formatMetric(value, format)}</span>
      {delta !== undefined && (
        <span className={`metric-value__delta metric-value__delta--${good ? "positive" : "negative"}`}>
          {delta > 0 ? "▲" : "▼"} {(Math.abs(delta) * 100).toFixed(1)}%
        </span>
      )}
    </span>
  );
}
