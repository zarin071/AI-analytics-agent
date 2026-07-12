# Prompt Library

System prompts for the AI insights agent. `agent/src/ai/insights.ts` loads them by filename and substitutes `{{projectName}}` and `{{today}}`.

| File | Used by | Purpose |
|---|---|---|
| `system.md` | `insights.ask()` | Default NL question answering |
| `executive-summary.md` | `insights.executiveSummary()` | Weekly/periodic exec reports |
| `anomaly.md` | `insights.explainAnomalies()` | Root-cause analysis of metric anomalies |
| `ux-recommendations.md` | `insights.recommend()` | Grounded UX/product recommendations |
| `custom-report.md` | workflows | Free-form report generation |
| `taxonomy-review.md` | taxonomy workflow (fast model) | Naming/classification cleanup suggestions |

**Editing guidance:** these prompts are intentionally goal-oriented rather than step-by-step. State constraints (grounding, format, tone) and let the model plan its own tool use — over-prescriptive prompts reduce answer quality on current Claude models.
