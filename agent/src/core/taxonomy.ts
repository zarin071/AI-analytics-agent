/**
 * Automatic event taxonomy.
 *
 * Every event that passes ingestion is registered/updated in `event_taxonomy`:
 *   - name split into object + action
 *   - category auto-classified from a keyword heuristic (AI refines it later
 *     via the `classify_taxonomy` workflow using the fast model)
 *   - property schema inferred incrementally from observed payloads
 *
 * Governance: an entry can be marked "blocked" in the dashboard; blocked
 * events are rejected at ingestion regardless of validationMode.
 */
import type { Database, EventCategory, TaxonomyEntry, TrackedEvent } from "../types.js";

const CATEGORY_HINTS: [EventCategory, RegExp][] = [
  ["acquisition", /(signup|sign_up|registered|invited|referral|landing)/],
  ["activation",  /(onboard|activated|completed_setup|first_)/],
  ["revenue",     /(purchase|checkout|payment|subscri|upgrade|invoice|trial)/],
  ["retention",   /(returned|renewed|reactivated|login|logged_in|session)/],
  ["engagement",  /(viewed|clicked|opened|created|shared|searched|exported|played)/],
];

export function classifyCategory(name: string): EventCategory {
  for (const [category, re] of CATEGORY_HINTS) if (re.test(name)) return category;
  return "other";
}

export function splitName(name: string): { object: string; action: string } {
  const parts = name.split("_");
  return { object: parts.slice(0, -1).join("_") || name, action: parts.at(-1) ?? "" };
}

function jsType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export class TaxonomyRegistry {
  constructor(private db: Database, private projectId: string) {}

  async isBlocked(name: string): Promise<boolean> {
    const rows = await this.db.query<{ status: string }>(
      `SELECT status FROM event_taxonomy WHERE project_id = $1 AND name = $2`,
      [this.projectId, name]
    );
    return rows[0]?.status === "blocked";
  }

  /** Upsert taxonomy entry and merge inferred property schema. Called async post-ingest. */
  async register(event: TrackedEvent): Promise<void> {
    const { object, action } = splitName(event.name);
    const schema: Record<string, { type: string }> = {};
    for (const [k, v] of Object.entries(event.properties)) schema[k] = { type: jsType(v) };

    await this.db.query(
      `INSERT INTO event_taxonomy (project_id, name, object, action, category, property_schema)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id, name) DO UPDATE SET
         last_seen_at    = now(),
         property_schema = event_taxonomy.property_schema || EXCLUDED.property_schema`,
      [this.projectId, event.name, object, action, classifyCategory(event.name), JSON.stringify(schema)]
    );
  }

  async list(): Promise<TaxonomyEntry[]> {
    return this.db.query<TaxonomyEntry>(
      `SELECT name, object, action, category, description,
              property_schema AS "propertySchema", status
       FROM event_taxonomy WHERE project_id = $1 ORDER BY name`,
      [this.projectId]
    );
  }
}
