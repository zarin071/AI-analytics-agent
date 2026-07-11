/**
 * Ingestion pipeline — the write path.
 *
 *   SDK batch → validate → (blocked?) → resolve identity → assign session
 *             → persist event → async: taxonomy registration, profile touch
 *
 * Pure orchestration; each step is an isolated, testable unit.
 */
import { randomUUID } from "node:crypto";
import type { Database, TrackedEvent, ValidationResult } from "../types.js";
import { validateEvent } from "./validator.js";
import { TaxonomyRegistry } from "./taxonomy.js";
import { SessionTracker } from "./sessions.js";
import { IdentityService } from "./identity.js";

export interface IngestOptions {
  validationMode: "strict" | "warn";
  autoRegister: boolean;
}

export interface IngestOutcome {
  accepted: number;
  rejected: { event: string; issues: ValidationResult["issues"] }[];
}

export class IngestionPipeline {
  readonly taxonomy: TaxonomyRegistry;
  readonly sessions: SessionTracker;
  readonly identity: IdentityService;

  constructor(
    private db: Database,
    private projectId: string,
    private opts: IngestOptions,
    sessionTimeoutMinutes = 30
  ) {
    this.taxonomy = new TaxonomyRegistry(db, projectId);
    this.sessions = new SessionTracker(db, projectId, sessionTimeoutMinutes);
    this.identity = new IdentityService(db, projectId);
  }

  async ingestBatch(events: TrackedEvent[]): Promise<IngestOutcome> {
    const outcome: IngestOutcome = { accepted: 0, rejected: [] };

    for (const raw of events) {
      const result = validateEvent(raw);
      const event = result.event;

      if (!result.valid && this.opts.validationMode === "strict") {
        outcome.rejected.push({ event: raw.name, issues: result.issues });
        continue;
      }
      if (await this.taxonomy.isBlocked(event.name)) {
        outcome.rejected.push({
          event: event.name,
          issues: [{ code: "blocked_by_taxonomy", message: `"${event.name}" is blocked in the taxonomy.` }],
        });
        continue;
      }

      // Identity: fill user_id from alias table when only anonymous_id present.
      if (!event.userId && event.anonymousId) {
        event.userId = (await this.identity.resolve(event.anonymousId)) ?? undefined;
      }

      const sessionId = await this.sessions.assign(event);

      await this.db.query(
        `INSERT INTO events (id, project_id, name, user_id, anonymous_id, session_id,
                             timestamp, properties, context, release, experiment, valid)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [randomUUID(), this.projectId, event.name, event.userId ?? null, event.anonymousId ?? null,
         sessionId, event.timestamp, JSON.stringify(event.properties), JSON.stringify(event.context ?? {}),
         event.release ?? null, event.experiment ? JSON.stringify(event.experiment) : null, result.valid]
      );
      outcome.accepted++;

      // Fire-and-forget enrichment (never blocks the hot path).
      if (this.opts.autoRegister) void this.taxonomy.register(event).catch(() => {});
      if (event.userId) {
        void this.db.query(
          `UPDATE user_profiles SET last_seen_at = now() WHERE project_id = $1 AND user_id = $2`,
          [this.projectId, event.userId]
        ).catch(() => {});
      }
    }
    return outcome;
  }
}
