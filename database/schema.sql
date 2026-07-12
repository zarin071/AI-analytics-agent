-- ============================================================================
-- AI Analytics Agent — Analytics Database Schema (PostgreSQL 14+)
-- ============================================================================
-- Multi-tenant by design: every row carries project_id. A single deployment
-- can serve many projects/apps; a single-project deployment simply uses one
-- project row (created automatically on first boot from analytics.config.ts).
--
-- For very high volume (>50M events/day) mirror `events` into ClickHouse via
-- connectors/bigquery-export.ts-style connector; the query engines emit ANSI
-- SQL that ports with minor changes. See database/clickhouse.sql.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Tenancy ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    environment   TEXT NOT NULL DEFAULT 'production',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    settings      JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS api_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key_hash      TEXT NOT NULL,                  -- sha256 of the key; raw key never stored
    kind          TEXT NOT NULL CHECK (kind IN ('public','secret')),
    label         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- ── Identity: user profiles & properties ────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_profiles (
    project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id       TEXT NOT NULL,                  -- your app's stable user id
    anonymous_ids TEXT[] NOT NULL DEFAULT '{}',   -- merged device/anon ids
    properties    JSONB NOT NULL DEFAULT '{}',    -- $set semantics
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_profiles_props     ON user_profiles USING GIN (properties);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON user_profiles (project_id, last_seen_at);

-- Maps anonymous ids -> user ids (identity resolution / aliasing)
CREATE TABLE IF NOT EXISTS identity_aliases (
    project_id    UUID NOT NULL,
    anonymous_id  TEXT NOT NULL,
    user_id       TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, anonymous_id)
);

-- ── Events (append-only, partitioned by month) ──────────────────────────────

CREATE TABLE IF NOT EXISTS events (
    id            UUID NOT NULL DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL,
    name          TEXT NOT NULL,                  -- validated: object_action
    user_id       TEXT,                           -- resolved user (nullable pre-identify)
    anonymous_id  TEXT,
    session_id    UUID,
    timestamp     TIMESTAMPTZ NOT NULL,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    properties    JSONB NOT NULL DEFAULT '{}',
    context       JSONB NOT NULL DEFAULT '{}',    -- device, os, page, utm, sdk
    release       TEXT,                           -- app version at event time
    experiment    JSONB,                          -- {key, variant} if enrolled
    valid         BOOLEAN NOT NULL DEFAULT true,  -- false = failed validation (warn mode)
    PRIMARY KEY (project_id, timestamp, id)
) PARTITION BY RANGE (timestamp);

-- Default partition; monthly partitions are created by database/migrate.mjs
CREATE TABLE IF NOT EXISTS events_default PARTITION OF events DEFAULT;

CREATE INDEX IF NOT EXISTS idx_events_name    ON events (project_id, name, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_user    ON events (project_id, user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_session ON events (project_id, session_id);
CREATE INDEX IF NOT EXISTS idx_events_props   ON events USING GIN (properties);

-- ── Sessions ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL,
    user_id       TEXT,
    anonymous_id  TEXT,
    started_at    TIMESTAMPTZ NOT NULL,
    ended_at      TIMESTAMPTZ,
    duration_s    INTEGER,
    event_count   INTEGER NOT NULL DEFAULT 0,
    entry_event   TEXT,
    exit_event    TEXT,
    context       JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions (project_id, user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions (project_id, started_at);

-- ── Taxonomy (auto-registered event catalog) ────────────────────────────────

CREATE TABLE IF NOT EXISTS event_taxonomy (
    project_id    UUID NOT NULL,
    name          TEXT NOT NULL,
    object        TEXT NOT NULL,                  -- "checkout"
    action        TEXT NOT NULL,                  -- "completed"
    category      TEXT,                           -- auto-classified: acquisition|activation|revenue|retention|engagement
    description   TEXT,
    property_schema JSONB NOT NULL DEFAULT '{}',  -- inferred JSON schema of properties
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    volume_30d    BIGINT NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deprecated','blocked')),
    PRIMARY KEY (project_id, name)
);

-- ── Analysis entities ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cohorts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL,
    name          TEXT NOT NULL,
    definition    JSONB NOT NULL,                 -- serialized CohortDefinition (see agent)
    is_static     BOOLEAN NOT NULL DEFAULT false,
    member_count  INTEGER,
    computed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cohort_members (
    cohort_id     UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    user_id       TEXT NOT NULL,
    added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (cohort_id, user_id)
);

CREATE TABLE IF NOT EXISTS saved_reports (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL,
    kind          TEXT NOT NULL,                  -- funnel|retention|segmentation|journey|custom|dashboard
    name          TEXT NOT NULL,
    definition    JSONB NOT NULL,
    created_by    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experiments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL,
    key           TEXT NOT NULL,                  -- "new_onboarding_flow"
    hypothesis    TEXT,
    variants      TEXT[] NOT NULL,
    primary_metric TEXT,                          -- event name
    started_at    TIMESTAMPTZ,
    ended_at      TIMESTAMPTZ,
    UNIQUE (project_id, key)
);

CREATE TABLE IF NOT EXISTS releases (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL,
    version       TEXT NOT NULL,                  -- "2.0.0"
    released_at   TIMESTAMPTZ NOT NULL,
    notes         TEXT,
    UNIQUE (project_id, version)
);

-- ── AI artifacts ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_insights (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL,
    kind          TEXT NOT NULL,                  -- answer|anomaly|summary|recommendation|report
    question      TEXT,
    body_md       TEXT NOT NULL,                  -- markdown insight
    evidence      JSONB NOT NULL DEFAULT '{}',    -- queries + result snapshots used
    severity      TEXT,                           -- for anomalies: info|warning|critical
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily per-user engagement scores (computed by engines/engagement.ts)
CREATE TABLE IF NOT EXISTS engagement_scores (
    project_id    UUID NOT NULL,
    user_id       TEXT NOT NULL,
    day           DATE NOT NULL,
    score         REAL NOT NULL,                  -- 0..100
    churn_risk    REAL,                           -- 0..1 predicted probability
    features      JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (project_id, user_id, day)
);

-- ── Materialized rollup for fast dashboards ─────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS daily_event_counts AS
SELECT project_id,
       name,
       date_trunc('day', timestamp)::date AS day,
       count(*)                            AS events,
       count(DISTINCT user_id)             AS users
FROM events
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_event_counts
    ON daily_event_counts (project_id, name, day);
-- Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY daily_event_counts; (cron: every 5 min)
