/**
 * Event validation + naming-standard enforcement.
 *
 * Naming standard: `object_action` — lowercase snake_case, past tense action.
 *   ✓ checkout_completed, user_signed_up, report_exported
 *   ✗ CheckoutCompleted, click, Signup!, page-view
 *
 * Behavior is driven by analytics.config.ts → taxonomy.validationMode:
 *   "strict": invalid events are rejected at the API (400)
 *   "warn":   invalid events are stored with valid=false and surfaced in the
 *             dashboard's Data Quality panel + AI insights.
 */
import type { TrackedEvent, ValidationIssue, ValidationResult } from "../types.js";

const EVENT_NAME_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;   // at least object_action
const PROPERTY_KEY_RE = /^[a-z$][a-z0-9_]*$/i;
const RESERVED_NAMES = new Set(["event", "distinct_id", "token", "time"]);
const MAX_NAME_LENGTH = 64;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const MAX_CLOCK_SKEW_MS = 1000 * 60 * 60 * 24 * 7;        // ±7 days

export function normalizeEventName(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")               // camelCase -> snake
    .replace(/[\s\-.]+/g, "_")                            // spaces/dashes/dots -> _
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/_{2,}/g, "_")
    .toLowerCase();
}

export function validateEvent(input: TrackedEvent, now: Date = new Date()): ValidationResult {
  const issues: ValidationIssue[] = [];
  const event: TrackedEvent = { ...input, properties: { ...input.properties } };

  // 1. Name
  const normalized = normalizeEventName(event.name ?? "");
  if (normalized !== event.name) {
    // Auto-normalize rather than reject; record the original for transparency.
    event.properties["$original_name"] = event.name;
    event.name = normalized;
  }
  if (!normalized || !EVENT_NAME_RE.test(normalized)) {
    issues.push({
      code: "invalid_name",
      message: `Event name "${input.name}" does not match the object_action standard (e.g. "checkout_completed").`,
    });
  }
  if (RESERVED_NAMES.has(normalized)) {
    issues.push({ code: "reserved_name", message: `"${normalized}" is a reserved name.` });
  }
  if (normalized.length > MAX_NAME_LENGTH) {
    issues.push({ code: "name_too_long", message: `Event names are limited to ${MAX_NAME_LENGTH} chars.` });
  }

  // 2. Property keys
  for (const key of Object.keys(event.properties)) {
    if (!PROPERTY_KEY_RE.test(key)) {
      issues.push({
        code: "bad_property_key",
        field: key,
        message: `Property key "${key}" must match ${PROPERTY_KEY_RE}.`,
      });
    }
  }

  // 3. Payload size
  if (Buffer.byteLength(JSON.stringify(event.properties)) > MAX_PAYLOAD_BYTES) {
    issues.push({ code: "oversized_payload", message: "Event properties exceed 32KB." });
  }

  // 4. Timestamp sanity — clamp wildly wrong client clocks to server time.
  const ts = Date.parse(event.timestamp);
  if (Number.isNaN(ts) || Math.abs(ts - now.getTime()) > MAX_CLOCK_SKEW_MS) {
    issues.push({
      code: "timestamp_out_of_range",
      message: `Timestamp "${event.timestamp}" missing or >7 days from server time; clamped.`,
    });
    event.timestamp = now.toISOString();
  }

  return { valid: issues.length === 0, issues, event };
}
