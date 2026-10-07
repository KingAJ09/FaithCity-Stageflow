import { describe, expect, it } from "vitest";
import { formatMs, timerSeverity } from "../src/utils/time";
import type { Timer } from "../src/types/index";

describe("timer formatting", () => {
  it("formats seconds", () => expect(formatMs(61000)).toBe("01:01"));
  it("formats hours", () => expect(formatMs(3661000)).toBe("01:01:01"));
  it("formats overtime", () => expect(formatMs(-32000)).toBe("-00:32"));
});

describe("timer severity", () => {
  type SeverityTimer = Pick<Timer, "status" | "type" | "warningSeconds" | "criticalSeconds">;
  const countdown = {
    type: "countdown",
    status: "running",
    warningSeconds: 120,
    criticalSeconds: 30,
  } satisfies SeverityTimer;

  it("uses the warning threshold", () => {
    expect(timerSeverity(countdown, 120_000)).toBe("warning");
  });
  it("uses the critical threshold", () => {
    expect(timerSeverity(countdown, 30_000)).toBe("critical");
  });
  it("does not alert before the warning threshold", () => {
    expect(timerSeverity(countdown, 121_000)).toBe("normal");
  });
  it("does not apply countdown thresholds to count-up timers", () => {
    const countup: SeverityTimer = { ...countdown, type: "countup" };
    expect(timerSeverity(countup, 1000)).toBe("normal");
  });
});
