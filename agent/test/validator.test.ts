import { describe, it, expect } from "vitest";
import { validateEvent, normalizeEventName } from "../src/core/validator.js";

const base = { timestamp: new Date().toISOString(), properties: {}, context: {} };

describe("normalizeEventName", () => {
  it("converts camelCase and separators to snake_case", () => {
    expect(normalizeEventName("CheckoutCompleted")).toBe("checkout_completed");
    expect(normalizeEventName("page view")).toBe("page_view");
    expect(normalizeEventName("Report-Exported")).toBe("report_exported");
  });
});

describe("validateEvent", () => {
  it("accepts a well-formed object_action event", () => {
    const r = validateEvent({ ...base, name: "checkout_completed" });
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("flags single-word names as violating the naming standard", () => {
    const r = validateEvent({ ...base, name: "click" });
    expect(r.valid).toBe(false);
    expect(r.issues[0]?.code).toBe("invalid_name");
  });

  it("normalizes but records the original name", () => {
    const r = validateEvent({ ...base, name: "UserSignedUp" });
    expect(r.event.name).toBe("user_signed_up");
    expect(r.event.properties.$original_name).toBe("UserSignedUp");
  });

  it("rejects reserved names", () => {
    const r = validateEvent({ ...base, name: "distinct_id" });
    expect(r.issues.some((i) => i.code === "reserved_name")).toBe(true);
  });

  it("clamps out-of-range timestamps to server time", () => {
    const r = validateEvent({ ...base, name: "checkout_completed", timestamp: "1999-01-01T00:00:00Z" });
    expect(r.issues.some((i) => i.code === "timestamp_out_of_range")).toBe(true);
    expect(Date.parse(r.event.timestamp)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("flags bad property keys", () => {
    const r = validateEvent({ ...base, name: "checkout_completed", properties: { "bad key!": 1 } });
    expect(r.issues.some((i) => i.code === "bad_property_key")).toBe(true);
  });
});
