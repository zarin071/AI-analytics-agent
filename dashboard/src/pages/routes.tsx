/**
 * Dashboard routes — one page per capability. Pages are thin compositions of
 * organisms; data fetching goes through src/lib/api.ts (typed client for
 * api/openapi.yaml). See docs/dashboard-wireframes.md for each page's layout.
 */
import { lazy } from "react";

export const routes = [
  { path: "/",            label: "Overview",        component: lazy(() => import("./Overview.js")) },
  { path: "/events",      label: "Event Explorer",  component: lazy(() => import("./EventExplorer.js")) },
  { path: "/funnels",     label: "Funnels",         component: lazy(() => import("./Funnels.js")) },
  { path: "/retention",   label: "Retention",       component: lazy(() => import("./Retention.js")) },
  { path: "/adoption",    label: "Feature Adoption",component: lazy(() => import("./Adoption.js")) },
  { path: "/users",       label: "User Profiles",   component: lazy(() => import("./Users.js")) },
  { path: "/sessions",    label: "Sessions",        component: lazy(() => import("./Sessions.js")) },
  { path: "/journeys",    label: "Journey Maps",    component: lazy(() => import("./Journeys.js")) },
  { path: "/cohorts",     label: "Cohorts",         component: lazy(() => import("./Cohorts.js")) },
  { path: "/conversion",  label: "Conversion",      component: lazy(() => import("./Conversion.js")) },
  { path: "/ai",          label: "AI Chat",         component: lazy(() => import("./AiChatPage.js")) },
  { path: "/reports",     label: "Saved Reports",   component: lazy(() => import("./Reports.js")) },
  { path: "/builder",     label: "Dashboard Builder", component: lazy(() => import("./Builder.js")) },
  { path: "/settings",    label: "Settings",        component: lazy(() => import("./Settings.js")) },
] as const;
