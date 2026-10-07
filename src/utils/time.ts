import type { Timer } from "../types/index.js";

export type TimerSeverity = "normal" | "warning" | "critical";

export function formatMs(ms: number, negative = true) {
  const sign = ms < 0 && negative ? "-" : "";
  ms = Math.abs(ms);
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${sign}${hours > 0 ? `${String(hours).padStart(2, "0")}:` : ""}${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function effectiveRemaining(t: {
  status: string;
  remainingMs: number;
  startTimestamp: number | null;
}) {
  if (t.status !== "running" || !t.startTimestamp) return t.remainingMs;
  return t.remainingMs - (Date.now() - t.startTimestamp);
}

export function timerSeverity(
  timer: Pick<Timer, "status" | "type" | "warningSeconds" | "criticalSeconds">,
  remainingMs: number,
): TimerSeverity {
  if (
    timer.type !== "countdown" ||
    (timer.status !== "running" && timer.status !== "paused")
  ) {
    return "normal";
  }
  if (remainingMs <= timer.criticalSeconds * 1000) return "critical";
  if (remainingMs <= timer.warningSeconds * 1000) return "warning";
  return "normal";
}
