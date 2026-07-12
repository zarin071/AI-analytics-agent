/** Postgres adapter implementing the Database port. */
import pg from "pg";
import type { Database } from "../types.js";

export class PostgresDatabase implements Database {
  private pool: pg.Pool;

  constructor(url: string, poolSize = 10) {
    this.pool = new pg.Pool({ connectionString: url, max: poolSize });
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(sql, params as any[]);
    return result.rows as T[];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
