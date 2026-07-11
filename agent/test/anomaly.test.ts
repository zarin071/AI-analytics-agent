import { describe, it, expect } from "vitest";
import { detectAnomalies } from "../src/engines/anomaly.js";

function series(days: number, base: number, jitter = 0): { day: string; value: number }[] {
  const out: { day: string; value: number }[] = [];
  const start = new Date("2026-01-01T00:00:00Z");
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400_000);
    out.push({ day: d.toISOString().slice(0, 10), value: base + ((i * 7) % (jitter + 1)) });
  }
  return out;
}

describe("detectAnomalies", () => {
  it("finds no anomalies in a flat series", () => {
    expect(detectAnomalies("signups", series(60, 100), 7)).toHaveLength(0);
  });

  it("detects a sharp drop", () => {
    const s = series(60, 100);
    s[s.length - 1] = { ...s[s.length - 1]!, value: 8 };
    const findings = detectAnomalies("signups", s, 7);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.direction).toBe("drop");
    expect(findings[0]?.severity).toBe("critical");
  });

  it("detects a spike with correct expected value", () => {
    const s = series(60, 50);
    s[s.length - 2] = { ...s[s.length - 2]!, value: 400 };
    const [finding] = detectAnomalies("purchases", s, 7);
    expect(finding?.direction).toBe("spike");
    expect(finding?.expected).toBe(50);
  });
});
