import type { WorkerPeriod } from "./workers";
export function workerCalendarDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(value => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function shiftCalendarDays(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
export function currentWorkerWeek(now = new Date()): WorkerPeriod {
  const today = workerCalendarDate(now);
  const day = new Date(`${today}T12:00:00.000Z`).getUTCDay();
  const from = shiftCalendarDays(today, -((day + 6) % 7));
  return { from, to: shiftCalendarDays(from, 6) };
}
/** Previous completed 14-day window ending on the Sunday before the current week. Custom dates accommodate a company's own payroll calendar. */
export function previousWorkerPeriod(now = new Date()): WorkerPeriod {
  const week = currentWorkerWeek(now);
  return {
    from: shiftCalendarDays(week.from, -14),
    to: shiftCalendarDays(week.from, -1),
  };
}
