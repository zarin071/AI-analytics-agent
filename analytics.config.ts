/**
 * ============================================================================
 *  AI ANALYTICS AGENT — SINGLE CONFIGURATION FILE
 * ============================================================================
 *  This is the ONLY file you need to edit when dropping this platform into a
 *  new project. Everything else (ingestion, sessionization, engines, AI,
 *  dashboard) derives its configuration from here.
 *
 *  Secrets come from environment variables (see .env.example); this file
 *  wires them together and sets project-level defaults.
 * ============================================================================
 */

export interface AnalyticsConfig {
  /** Human-readable project name — shown in the dashboard and AI reports. */
  projectName: string;

  /** Deployment environment. */
  environment: "development" | "staging" | "production";

  /** Analytics database. Postgres is the default; ClickHouse optional for scale. */
  database: {
    driver: "postgres" | "clickhouse";
    url: string;                 // e.g. postgres://user:pass@host:5432/analytics
    poolSize: number;
    /** Retention of raw events, in days. 0 = keep forever. */
    eventRetentionDays: number;
  };

  /** Authentication for the API and dashboard. */
  auth: {
    /** Secret used to sign dashboard JWTs. */
    jwtSecret: string;
    /** Server-side secret keys (full access). Comma-separated in env. */
    secretKeys: string[];
    /** Public (write-only) keys embedded in client SDKs. */
    publicKeys: string[];
    /** Allowed CORS origins for the ingestion endpoint. */
    allowedOrigins: string[];
  };

  /** AI provider powering insights, NL queries, and reports. */
  ai: {
    provider: "anthropic";
    apiKey: string;
    /** Default model for analysis. */
    model: string;
    /** Cheaper model for classification / naming-standard checks. */
    fastModel: string;
    maxTokens: number;
  };

  /** Session tracking. */
  sessions: {
    /** Minutes of inactivity before a session is closed. */
    timeoutMinutes: number;
  };

  /** Event validation & taxonomy. */
  taxonomy: {
    /** Naming standard enforced on event names. */
    namingConvention: "object_action";     // e.g. "checkout_completed"
    /** Reject events that fail validation ("strict") or accept + flag ("warn"). */
    validationMode: "strict" | "warn";
    /** Auto-register unseen events into the taxonomy. */
    autoRegister: boolean;
  };

  /** HTTP API. */
  api: { port: number; host: string };

  /** Dashboard dev server. */
  dashboard: { port: number };

  /** Connectors enabled for this project (must be registered in connectors/). */
  connectors: { name: string; options?: Record<string, unknown> }[];
}

const env = (key: string, fallback = ""): string => process.env[key] ?? fallback;

const config: AnalyticsConfig = {
  // ─── EDIT THESE ────────────────────────────────────────────────────────────
  projectName: env("ANALYTICS_PROJECT_NAME", "My Project"),
  environment: (env("NODE_ENV", "development") as AnalyticsConfig["environment"]),

  database: {
    driver: "postgres",
    url: env("ANALYTICS_DATABASE_URL", "postgres://analytics:analytics@localhost:5432/analytics"),
    poolSize: 10,
    eventRetentionDays: 0,
  },

  auth: {
    jwtSecret: env("ANALYTICS_JWT_SECRET", "change-me-in-production"),
    secretKeys: env("ANALYTICS_SECRET_KEYS", "").split(",").filter(Boolean),
    publicKeys: env("ANALYTICS_PUBLIC_KEYS", "").split(",").filter(Boolean),
    allowedOrigins: env("ANALYTICS_ALLOWED_ORIGINS", "*").split(","),
  },

  ai: {
    provider: "anthropic",
    apiKey: env("ANTHROPIC_API_KEY"),
    model: env("ANALYTICS_AI_MODEL", "claude-opus-4-8"),
    fastModel: env("ANALYTICS_AI_FAST_MODEL", "claude-haiku-4-5"),
    maxTokens: 16000,
  },
  // ─── DEFAULTS BELOW RARELY NEED CHANGES ───────────────────────────────────

  sessions: { timeoutMinutes: 30 },

  taxonomy: {
    namingConvention: "object_action",
    validationMode: "warn",
    autoRegister: true,
  },

  api: { port: Number(env("ANALYTICS_API_PORT", "4000")), host: "0.0.0.0" },
  dashboard: { port: Number(env("ANALYTICS_DASHBOARD_PORT", "3000")) },

  connectors: [
    // { name: "slack", options: { channel: "#analytics" } },
    // { name: "bigquery-export", options: { dataset: "analytics" } },
  ],
};

export default config;
