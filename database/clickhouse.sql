-- ============================================================================
-- Optional ClickHouse mirror for high-volume event analytics (>50M events/day)
-- ============================================================================
-- Postgres remains the system of record for profiles, taxonomy, cohorts, and
-- AI artifacts; ClickHouse serves the heavy scan queries (funnels, retention).
-- The engines in agent/src/engines emit ANSI SQL; the ClickHouse dialect
-- adapter lives in agent/src/db/dialect.ts.

CREATE TABLE IF NOT EXISTS events
(
    project_id   UUID,
    id           UUID,
    name         LowCardinality(String),
    user_id      String,
    anonymous_id String,
    session_id   UUID,
    timestamp    DateTime64(3, 'UTC'),
    properties   String,          -- JSON
    context      String,          -- JSON
    release      LowCardinality(String),
    valid        UInt8 DEFAULT 1
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, name, timestamp, user_id)
TTL toDateTime(timestamp) + INTERVAL 2 YEAR;
