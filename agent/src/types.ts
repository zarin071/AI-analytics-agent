/**
 * Domain types — the shared language of the platform (DDD ubiquitous language).
 * No framework imports allowed in this package (Clean Architecture inner ring).
 */

export interface TrackedEvent {
  name: string;
  userId?: string;
  anonymousId?: string;
  timestamp: string;                       // ISO 8601, client clock
  properties: Record<string, unknown>;
  context: EventContext;
  release?: string;
  experiment?: { key: string; variant: string };
}

export interface EventContext {
  sdk?: { name: string; version: string };
  page?: { url?: string; path?: string; referrer?: string; title?: string };
  device?: { type?: string; os?: string; browser?: string; model?: string };
  locale?: string;
  timezone?: string;
  ip?: string;
  utm?: Partial<Record<"source" | "medium" | "campaign" | "term" | "content", string>>;
  [key: string]: unknown;
}

export interface StoredEvent extends TrackedEvent {
  id: string;
  projectId: string;
  sessionId?: string;
  receivedAt: string;
  valid: boolean;
}

export interface ValidationIssue {
  code:
    | "invalid_name"
    | "reserved_name"
    | "name_too_long"
    | "bad_property_key"
    | "oversized_payload"
    | "timestamp_out_of_range"
    | "blocked_by_taxonomy";
  message: string;
  field?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  /** Normalized event (name lowercased/snake_cased, keys cleaned). */
  event: TrackedEvent;
}

export interface TaxonomyEntry {
  name: string;
  object: string;
  action: string;
  category: EventCategory;
  description?: string;
  propertySchema: Record<string, { type: string; examples?: unknown[] }>;
  status: "active" | "deprecated" | "blocked";
}

export type EventCategory =
  | "acquisition"
  | "activation"
  | "engagement"
  | "revenue"
  | "retention"
  | "other";

export interface UserProfile {
  userId: string;
  properties: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
}

// ── Analysis definitions (serialized into saved_reports.definition) ─────────

export interface DateRange { from: string; to: string }

export interface FunnelStep { event: string; where?: PropertyFilter[] }
export interface FunnelDefinition {
  steps: FunnelStep[];
  range: DateRange;
  /** Max time allowed between first and last step. */
  conversionWindowHours: number;
  segmentBy?: string;                      // property to break down by
}
export interface FunnelResult {
  steps: { event: string; users: number; conversionFromPrevious: number; conversionFromStart: number; medianTimeToNextS?: number }[];
  totalConversion: number;
}

export interface RetentionDefinition {
  cohortEvent: string;                     // what makes a user enter a cohort (e.g. "user_signed_up")
  returnEvent: string;                     // what counts as "came back" (e.g. "$any" or specific)
  range: DateRange;
  interval: "day" | "week" | "month";
  periods: number;
}
export interface RetentionResult {
  cohorts: { cohortDate: string; size: number; retention: number[] }[]; // retention[i] = % active in period i
}

export interface PropertyFilter {
  property: string;                        // "properties.plan" | "context.device.os" | "user.plan"
  op: "eq" | "neq" | "in" | "gt" | "lt" | "contains" | "exists";
  value?: unknown;
}

export interface CohortDefinition {
  /** All conditions must hold (AND); each condition may be behavioral or property-based. */
  conditions: (
    | { kind: "performed"; event: string; atLeast: number; inLastDays: number }
    | { kind: "not_performed"; event: string; inLastDays: number }
    | { kind: "property"; filter: PropertyFilter }
  )[];
}

export interface SegmentationQuery {
  event: string;
  range: DateRange;
  interval: "hour" | "day" | "week" | "month";
  measure: "events" | "users" | "sum" | "avg";
  measureProperty?: string;                // for sum/avg
  groupBy?: string;                        // property path
  where?: PropertyFilter[];
}

export interface AnomalyFinding {
  metric: string;                          // e.g. "events:user_signed_up"
  day: string;
  observed: number;
  expected: number;
  zScore: number;
  direction: "spike" | "drop";
  severity: "info" | "warning" | "critical";
}

export interface Insight {
  kind: "answer" | "anomaly" | "summary" | "recommendation" | "report";
  question?: string;
  bodyMd: string;
  evidence: Record<string, unknown>;
  severity?: "info" | "warning" | "critical";
}

/** Minimal DB abstraction so engines stay storage-agnostic (port, in Clean Architecture terms). */
export interface Database {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}
