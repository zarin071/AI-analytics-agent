/** Organism: horizontal funnel with per-step conversion + drop-off callouts. */
import { formatMetric } from "../atoms/MetricValue.js";

export interface FunnelChartProps {
  steps: { event: string; users: number; conversionFromStart: number; medianTimeToNextS?: number }[];
  onStepClick?: (event: string) => void;
}

export function FunnelChart({ steps, onStepClick }: FunnelChartProps) {
  const max = steps[0]?.users ?? 1;
  return (
    <div className="funnel" role="list">
      {steps.map((step, i) => {
        const prev = steps[i - 1];
        const dropOff = prev ? prev.users - step.users : 0;
        return (
          <div key={step.event} className="funnel__step" role="listitem">
            <button className="funnel__bar-wrap" onClick={() => onStepClick?.(step.event)}>
              <div className="funnel__bar" style={{ width: `${(step.users / max) * 100}%` }} />
              <div className="funnel__meta">
                <span className="funnel__event">{i + 1}. {step.event}</span>
                <span className="funnel__users">{formatMetric(step.users)} users</span>
                <span className="funnel__conv">{formatMetric(step.conversionFromStart, "percent")} of start</span>
              </div>
            </button>
            {i < steps.length - 1 && (
              <div className="funnel__dropoff">
                ↓ {formatMetric(dropOff)} drop off
                {step.medianTimeToNextS ? ` · median ${formatMetric(step.medianTimeToNextS, "duration")} to next step` : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
