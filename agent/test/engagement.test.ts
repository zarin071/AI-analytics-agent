import { describe, it, expect } from "vitest";
import { scoreUser } from "../src/engines/engagement.js";

describe("scoreUser", () => {
  it("scores a highly active daily user near the top with low churn risk", () => {
    const r = scoreUser({ daysSinceLast: 0.2, eventsLast30: 400, distinctEvents30: 12, sessions30: 28, medianGapDays: 1 });
    expect(r.score).toBeGreaterThan(80);
    expect(r.churnRisk).toBeLessThan(0.2);
  });

  it("scores a lapsed user low with high churn risk", () => {
    const r = scoreUser({ daysSinceLast: 21, eventsLast30: 3, distinctEvents30: 1, sessions30: 1, medianGapDays: 2 });
    expect(r.score).toBeLessThan(30);
    expect(r.churnRisk).toBeGreaterThan(0.9);
  });

  it("respects the user's own cadence: weekly users are not churned after 5 days", () => {
    const weekly = scoreUser({ daysSinceLast: 5, eventsLast30: 20, distinctEvents30: 5, sessions30: 4, medianGapDays: 7 });
    const daily = scoreUser({ daysSinceLast: 5, eventsLast30: 20, distinctEvents30: 5, sessions30: 4, medianGapDays: 1 });
    expect(weekly.churnRisk).toBeLessThan(daily.churnRisk);
  });
});
