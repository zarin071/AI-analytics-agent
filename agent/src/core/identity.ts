/**
 * Identity resolution + user profiles.
 *
 * - `identify(anonymousId, userId)` links pre-login activity to the user and
 *   retroactively stamps user_id onto anonymous events.
 * - Profile properties use $set semantics (shallow merge); `$set_once` keys
 *   are only written if absent.
 */
import type { Database, UserProfile } from "../types.js";

export class IdentityService {
  constructor(private db: Database, private projectId: string) {}

  async identify(userId: string, anonymousId?: string, traits: Record<string, unknown> = {}): Promise<void> {
    await this.db.query(
      `INSERT INTO user_profiles (project_id, user_id, properties, anonymous_ids)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, user_id) DO UPDATE SET
         properties   = user_profiles.properties || EXCLUDED.properties,
         anonymous_ids = (SELECT array(SELECT DISTINCT unnest(user_profiles.anonymous_ids || EXCLUDED.anonymous_ids))),
         last_seen_at = now()`,
      [this.projectId, userId, JSON.stringify(traits), anonymousId ? [anonymousId] : []]
    );

    if (anonymousId) {
      await this.db.query(
        `INSERT INTO identity_aliases (project_id, anonymous_id, user_id)
         VALUES ($1, $2, $3) ON CONFLICT (project_id, anonymous_id) DO NOTHING`,
        [this.projectId, anonymousId, userId]
      );
      // Retroactive stitching: claim this device's anonymous events.
      await this.db.query(
        `UPDATE events SET user_id = $3
         WHERE project_id = $1 AND anonymous_id = $2 AND user_id IS NULL`,
        [this.projectId, anonymousId, userId]
      );
    }
  }

  async setOnce(userId: string, traits: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `UPDATE user_profiles
       SET properties = $3::jsonb || properties          -- existing keys win
       WHERE project_id = $1 AND user_id = $2`,
      [this.projectId, userId, JSON.stringify(traits)]
    );
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const rows = await this.db.query<UserProfile>(
      `SELECT user_id AS "userId", properties,
              first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt"
       FROM user_profiles WHERE project_id = $1 AND user_id = $2`,
      [this.projectId, userId]
    );
    return rows[0] ?? null;
  }

  /** Resolve an anonymous id to a known user id, if aliased. */
  async resolve(anonymousId: string): Promise<string | null> {
    const rows = await this.db.query<{ user_id: string }>(
      `SELECT user_id FROM identity_aliases WHERE project_id = $1 AND anonymous_id = $2`,
      [this.projectId, anonymousId]
    );
    return rows[0]?.user_id ?? null;
  }
}
