/**
 * Shared SQL builders for the analytics engines.
 *
 * All user-supplied identifiers (property paths, event names) are bound as
 * parameters or strictly whitelisted — engines never interpolate raw input
 * into SQL (see docs/security.md → SQL injection).
 */
import type { PropertyFilter } from "../types.js";

const PATH_RE = /^[a-z$][a-zA-Z0-9_.]{0,128}$/;

/**
 * Convert a property path ("properties.plan", "context.device.os") to a
 * Postgres JSONB extraction expression over the events table.
 */
export function propertyExpr(path: string): string {
  if (!PATH_RE.test(path)) throw new Error(`Illegal property path: ${path}`);
  const [root = "", ...rest] = path.split(".");
  const column = root === "context" ? "context" : "properties";
  const keys: string[] =
    root === "properties" || root === "context" ? rest : [root, ...rest].slice(root === "user" ? 1 : 0);
  if (keys.length === 0) throw new Error(`Property path too short: ${path}`);
  const quoted = keys.map((k) => `'${k.replace(/'/g, "")}'`);
  return `${column} #>> ARRAY[${quoted.join(",")}]`;
}

/** Render filters to a WHERE fragment; values appended to `params`. */
export function filtersToSql(filters: PropertyFilter[] | undefined, params: unknown[]): string {
  if (!filters?.length) return "";
  const clauses = filters.map((f) => {
    const expr = propertyExpr(f.property);
    switch (f.op) {
      case "eq":       params.push(String(f.value)); return `${expr} = $${params.length}`;
      case "neq":      params.push(String(f.value)); return `${expr} IS DISTINCT FROM $${params.length}`;
      case "in":       params.push((f.value as unknown[]).map(String)); return `${expr} = ANY($${params.length})`;
      case "gt":       params.push(Number(f.value)); return `(${expr})::numeric > $${params.length}`;
      case "lt":       params.push(Number(f.value)); return `(${expr})::numeric < $${params.length}`;
      case "contains": params.push(`%${f.value}%`);  return `${expr} ILIKE $${params.length}`;
      case "exists":   return `${expr} IS NOT NULL`;
    }
  });
  return " AND " + clauses.join(" AND ");
}

export const INTERVAL_TRUNC: Record<string, string> = {
  hour: "hour", day: "day", week: "week", month: "month",
};
