/**
 * Day and hour math across two time zones. Meta buckets days and hours in the ad account's own time zone,
 * while the owner reads the dashboard in Dubai time.
 */

import type { Rules, SeriesPoint } from "./types.ts";

/** "2026-09-30" → "30.09"; anything else is returned as is. */
export function shortDate(value: string) {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[2]}.${m[1]}` : value;
}

/** Today as YYYY-MM-DD in a time zone (Dubai for the owner, the account zone for Meta's day buckets). */
export function todayIn(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/** "2026-09-28" + n days → "2026-09-(28+n)". */
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days from a to b (YYYY-MM-DD). */
export function daysBetween(a: string, b: string) {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** Meta sends "+0000"; Date wants "+00:00". */
export function isoDate(iso: string) {
  return new Date(iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

/** «сегодня» / «завтра» / «через 2 дн.» (today / tomorrow / in 2 days). */
export function dueIn(days: number) {
  if (days <= 0) return "сегодня";
  if (days === 1) return "завтра";
  return `через ${days} дн.`;
}

/** The plan's next control point: today's or the first one ahead (Dubai date), with days left; null when all passed. */
export function nextCheckpoint(checkpoints: Rules["checkpoints"]) {
  const today = todayIn("Asia/Dubai");
  const next = checkpoints.find((c) => c.date >= today);
  return next ? { ...next, days: daysBetween(today, next.date) } : null;
}

/** The plan's next reach target (first one not yet past, Dubai date), or the last one. */
export function nextTarget(targets: Rules["reachTargets"]) {
  if (targets.length === 0) return null;
  const today = todayIn("Asia/Dubai");
  return targets.find((t) => t.date >= today) ?? targets[targets.length - 1];
}

/** Hour of the day (0–23) in a time zone. */
function hourIn(timeZone: string, date: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(date)) % 24;
}

/**
 * Hourly points with the silent hours between the first and the last hour that has data filled with zeros, so the
 * line never breaks. Labels are Dubai hours (the day starts at the Dubai hour of the account's midnight, 02:00 in
 * summer). No hours are added before the first hour Meta reported or after the last one: Meta hasn't reported the
 * current hour yet, and a trailing 0 there would read as «delivery stopped».
 */
export function fillHours(points: SeriesPoint[], accountZone: string): SeriesPoint[] {
  const now = new Date();
  const dubai = hourIn("Asia/Dubai", now);
  const start = (dubai - hourIn(accountZone, now) + 24) % 24;
  const label = (i: number) => `${String((start + i) % 24).padStart(2, "0")}:00`;
  const indexOf = (hh: string) => (Number.parseInt(hh, 10) - start + 24) % 24;
  const byIndex = new Map<number, SeriesPoint>();
  for (const p of points) {
    if (!Number.isNaN(Number.parseInt(p.label, 10))) byIndex.set(indexOf(p.label), p);
  }
  if (byIndex.size === 0) return [];
  const indices = [...byIndex.keys()];
  const first = Math.min(...indices);
  const last = Math.max(...indices);
  return Array.from(
    { length: last - first + 1 },
    (_, i) => byIndex.get(first + i) ?? { label: label(first + i), spend: 0, impressions: 0, video3s: 0 },
  );
}

export type DayPoint = Pick<SeriesPoint, "spend" | "impressions" | "video3s"> & { reach: number; day: string };

/**
 * The last 7 days ending today (account time zone, as Meta buckets days). Meta's «last_7d» stops at yesterday,
 * so today comes from the «since launch» series; days without delivery are zeros.
 */
export function lastSevenDays(
  week: SeriesPoint[] | undefined,
  launch: SeriesPoint[] | undefined,
  timeZone: string,
): DayPoint[] {
  const byDay = new Map<string, SeriesPoint>();
  for (const p of week ?? []) byDay.set(p.label, p);
  for (const p of launch ?? []) byDay.set(p.label, p);
  const today = todayIn(timeZone);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    const p = byDay.get(day);
    return {
      day,
      spend: p?.spend ?? 0,
      impressions: p?.impressions ?? 0,
      video3s: p?.video3s ?? 0,
      reach: p?.reach ?? 0,
    };
  });
}
