#!/usr/bin/env node
/**
 * Minimal, dependency-light migration runner.
 * - Applies database/schema.sql (idempotent: IF NOT EXISTS everywhere)
 * - Applies database/migrations/*.sql in filename order, tracked in _migrations
 * - Ensures a monthly partition exists for the current + next month
 *
 * Usage: node database/migrate.mjs   (reads ANALYTICS_DATABASE_URL)
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.ANALYTICS_DATABASE_URL;
if (!url) { console.error("ANALYTICS_DATABASE_URL is not set"); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query(readFileSync(join(here, "schema.sql"), "utf8"));

  await client.query(
    `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`
  );
  const migDir = join(here, "migrations");
  const applied = new Set((await client.query(`SELECT name FROM _migrations`)).rows.map(r => r.name));
  const files = existsSync(migDir) ? readdirSync(migDir).filter(f => f.endsWith(".sql")).sort() : [];
  for (const f of files) {
    if (applied.has(f)) continue;
    console.log(`applying migration ${f}`);
    await client.query("BEGIN");
    await client.query(readFileSync(join(migDir, f), "utf8"));
    await client.query(`INSERT INTO _migrations(name) VALUES ($1)`, [f]);
    await client.query("COMMIT");
  }

  // Monthly partitions for current and next month
  for (const offset of [0, 1]) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + offset);
    const from = d.toISOString().slice(0, 10);
    const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    const name = `events_${from.slice(0, 7).replace("-", "_")}`;
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${name} PARTITION OF events FOR VALUES FROM ('${from}') TO ('${to}')`
    );
  }
  console.log("migrations complete");
} finally {
  await client.end();
}
