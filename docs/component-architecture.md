# Component Architecture (Dashboard)

## Atomic design

```
atoms/        MetricValue, Badge, Spinner, Chip, Skeleton
molecules/    MetricCard, FilterRow, EventPicker, DateRangePicker, SearchInput
organisms/    FunnelChart, RetentionGrid, SegmentationChart, JourneySankey,
              AiChat, TaxonomyTree, CohortBuilder, UserDrawer, ReportTile
templates/    DashboardShell (nav + topbar + content), ReportLayout
pages/        14 routes (src/pages/routes.tsx) — thin compositions only
```

Rules:

1. **Pages never fetch ad hoc** — all data flows through `src/lib/api.ts` (typed against `api/openapi.yaml`), so the contract breaks loudly at one seam.
2. **Organisms are presentation-pure** — they take result shapes from `@ai-analytics/agent` types (FunnelResult, RetentionResult…) and callbacks; no fetching inside. This is what makes Storybook stories honest and cheap.
3. **Atoms/molecules own no domain types** — only primitives and formatting (`formatMetric`).

## Design tokens

`design-tokens/tokens.json` is the single source: colors (light/dark), type scale, spacing, radii, shadows, motion, categorical chart ramp. A build step emits `src/styles/tokens.css` custom properties; components reference only `var(--color-*)`, `var(--space-*)` — rebranding is a token swap, no component edits. Charts consume `color.chart.categorical` in order for series stability across views.

## Storybook

- Co-located stories (`*.stories.tsx`) for every molecule/organism; shipped examples: `MetricCard` (default/negative/inverted-delta/loading) and `FunnelChart` (checkout funnel).
- Stories double as visual regression surface (Chromatic or `storybook test-runner`).
- Token file loaded globally in `.storybook/preview` so stories render on-brand in both themes.

## State

- Server state: fetch-per-view with request-level caching (add TanStack Query when views multiply — the api.ts seam makes that a local change).
- Global client state is deliberately tiny: date range, project, theme — a context at the shell template.
- URL is the source of truth for report definitions (shareable/bookmarkable analyses); "Save as report" persists the same JSON server-side.
