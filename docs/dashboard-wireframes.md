# Dashboard Wireframes

Shared shell: left nav (14 sections), top bar (project switcher · date range · environment badge · "Ask AI" ⌘K), content area. All pages read the global date range unless noted.

## Overview
```
┌ nav ┬──────────────────────────────────────────────────────┐
│     │  [WAU 12.8k ▲6%] [Signups 941 ▼4%] [Conv 9.3%] [Rev] │
│     │  ┌ Active users (line, 12w) ──────────────────────┐  │
│     │  └────────────────────────────────────────────────┘  │
│     │  ┌ AI briefing ─────────────┐ ┌ Anomalies ────────┐  │
│     │  │ latest exec summary TL;DR│ │ 🔴 signups drop…  │  │
│     │  └──────────────────────────┘ └───────────────────┘  │
└─────┴──────────────────────────────────────────────────────┘
```

## Event Explorer
Left: taxonomy tree (category → event, with volume + validity badge, blocked/deprecated states). Main: segmentation chart (measure · interval · groupBy · filters), table of buckets below, "Save as report".

## Funnels
Step builder rows (event + optional filters, drag to reorder) · conversion window control → `FunnelChart` organism with drop-off callouts; click a step → side panel: journeys backward from the step + "Ask AI why users drop here".

## Retention
Cohort event / return event pickers, interval + periods → `RetentionGrid` heatmap triangle; row click → cohort saved as Cohort entity.

## Feature Adoption
Feature list (event groups from taxonomy) with adoption %, uses/user, stickiness bars; detail: adoption trend + adopter vs non-adopter retention overlay ("does this feature retain?").

## User Profiles
Search / filter by properties or cohort → table (user, plan, first/last seen, engagement score ring, churn risk). Detail drawer: traits, engagement features, session list, full activity timeline.

## Sessions
Histogram of duration + sessions/day trend; table (user, entry→exit event, events, duration); click → timeline of the session's events.

## Journey Maps
Anchor event + direction + depth → Sankey (nodes = `JourneyNode`, links = `JourneyEdge`); hovering an edge shows user counts; "expand" on a node re-anchors.

## Cohorts
List (name, members, dynamic/static, computed_at) → builder: condition rows (performed / not performed / property) with live member-count preview; actions: save, export CSV, use-in-funnel/retention.

## Conversion
Saved goal pairs (from→to, window) as cards with rate + trend sparkline; detail: the underlying 2-step funnel + median time distribution.

## AI Chat
`AiChat` organism full-page: suggestion chips, markdown answers with collapsible "Evidence" (tool calls), "Save as report" and "Send to Slack" actions per answer.

## Saved Reports
Grid of report cards (kind icon, name, owner, updated) + AI insights feed (summaries, anomaly explanations); open → renders the stored definition through the matching organism.

## Dashboard Builder
Grid canvas (drag/resize tiles); tile types: metric card, segmentation chart, funnel, retention grid, insight feed, markdown. Tile config = the same JSON the query API takes; dashboards persist as `saved_reports(kind='dashboard')`.

## Settings
Tabs: **Project** (name, environment, retention days) · **API Keys** (create/revoke, last used) · **Taxonomy** (naming mode strict/warn, block/deprecate events, review AI suggestions) · **Connectors** (enable + options per connector) · **AI** (model, budget alerts) · **Data Quality** (invalid-event feed).
