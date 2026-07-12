/**
 * Session tracking (server-side sessionization).
 *
 * A session is a sequence of events from the same user/device with gaps
 * smaller than `timeoutMinutes` (default 30, from analytics.config.ts).
 * The tracker assigns session_ids at ingestion time and finalizes sessions
 * (duration, entry/exit event) when the timeout elapses.
 */
import { randomUUID } from "node:crypto";
import type { Database, TrackedEvent } from "../types.js";

interface LiveSession { id: string; lastSeen: number; startedAt: number; entryEvent: string; eventCount: number; lastEvent: string }

export class SessionTracker {
  private live = new Map<string, LiveSession>();       // key: userId || anonymousId
  private timeoutMs: number;

  constructor(private db: Database, private projectId: string, timeoutMinutes = 30) {
    this.timeoutMs = timeoutMinutes * 60_000;
  }

  /** Returns the session id for this event, creating/rotating sessions as needed. */
  async assign(event: TrackedEvent): Promise<string> {
    const key = event.userId ?? event.anonymousId ?? "anonymous";
    const ts = Date.parse(event.timestamp);
    const current = this.live.get(key);

    if (current && ts - current.lastSeen <= this.timeoutMs) {
      current.lastSeen = ts;
      current.eventCount += 1;
      current.lastEvent = event.name;
      return current.id;
    }

    if (current) await this.finalize(key, current);

    const session: LiveSession = {
      id: randomUUID(),
      startedAt: ts,
      lastSeen: ts,
      entryEvent: event.name,
      eventCount: 1,
      lastEvent: event.name,
    };
    this.live.set(key, session);
    await this.db.query(
      `INSERT INTO sessions (id, project_id, user_id, anonymous_id, started_at, entry_event, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [session.id, this.projectId, event.userId ?? null, event.anonymousId ?? null,
       new Date(ts).toISOString(), event.name, JSON.stringify(event.context ?? {})]
    );
    return session.id;
  }

  private async finalize(key: string, s: LiveSession): Promise<void> {
    this.live.delete(key);
    await this.db.query(
      `UPDATE sessions SET ended_at = $2, duration_s = $3, event_count = $4, exit_event = $5 WHERE id = $1`,
      [s.id, new Date(s.lastSeen).toISOString(), Math.round((s.lastSeen - s.startedAt) / 1000), s.eventCount, s.lastEvent]
    );
  }

  /** Sweep sessions whose timeout elapsed. Call on an interval (the API does, every minute). */
  async sweep(now: number = Date.now()): Promise<number> {
    let closed = 0;
    for (const [key, s] of this.live) {
      if (now - s.lastSeen > this.timeoutMs) {
        await this.finalize(key, s);
        closed++;
      }
    }
    return closed;
  }
}
