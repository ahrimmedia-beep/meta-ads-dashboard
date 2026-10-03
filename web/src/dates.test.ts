import assert from "node:assert/strict";
import { describe, type TestContext, test } from "node:test";

import {
  addDays,
  daysBetween,
  dueIn,
  fillHours,
  isoDate,
  lastSevenDays,
  nextCheckpoint,
  nextTarget,
  shortDate,
  todayIn,
} from "./dates.ts";
import type { SeriesPoint } from "./types.ts";

/** Freeze the clock for one test. */
function at(t: TestContext, iso: string) {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(iso) });
}

const point = (label: string, impressions: number): SeriesPoint => ({ label, spend: 1, impressions, video3s: 0 });

describe("plain day math", () => {
  test("shortDate keeps day and month, leaves other text alone", () => {
    assert.equal(shortDate("2026-09-30"), "30.09");
    assert.equal(shortDate("2026-09-30T10:00:00+0000"), "30.09");
    assert.equal(shortDate("soon"), "soon");
  });

  test("addDays crosses month, year and leap day", () => {
    assert.equal(addDays("2026-09-28", 3), "2026-10-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(addDays("2028-03-01", -1), "2028-02-29");
  });

  test("daysBetween counts whole days, with sign", () => {
    assert.equal(daysBetween("2026-09-28", "2026-10-04"), 6);
    assert.equal(daysBetween("2026-10-04", "2026-09-28"), -6);
    // The last Sunday of October is a DST change in Europe; whole days stay whole.
    assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2);
  });

  test("isoDate reads Meta's +0000 and +0200 offsets", () => {
    assert.equal(isoDate("2026-09-28T10:00:00+0000").toISOString(), "2026-09-28T10:00:00.000Z");
    assert.equal(isoDate("2026-09-28T12:00:00+0200").toISOString(), "2026-09-28T10:00:00.000Z");
  });

  test("dueIn", () => {
    assert.equal(dueIn(-1), "сегодня");
    assert.equal(dueIn(0), "сегодня");
    assert.equal(dueIn(1), "завтра");
    assert.equal(dueIn(3), "через 3 дн.");
  });
});

describe("today in a time zone", () => {
  test("Dubai is already on the next day while Berlin is not", (t) => {
    at(t, "2026-09-28T21:30:00Z");
    assert.equal(todayIn("Asia/Dubai"), "2026-09-29");
    assert.equal(todayIn("Europe/Berlin"), "2026-09-28");
  });
});

describe("nextCheckpoint / nextTarget", () => {
  const checkpoints = [
    { date: "2026-05-11", title: "Старт", note: "" },
    { date: "2026-05-12", title: "Первая проверка", note: "" },
    { date: "2026-05-14", title: "Выбор роликов", note: "" },
    { date: "2026-05-18", title: "Итог", note: "" },
  ];

  test("picks the first point ahead by the Dubai date", (t) => {
    // Still the 12th in UTC, but the 13th in Dubai: the 12th has passed.
    at(t, "2026-05-12T21:30:00Z");
    assert.deepEqual(nextCheckpoint(checkpoints), { ...checkpoints[2], days: 1 });
  });

  test("a point due today counts, with 0 days left", (t) => {
    at(t, "2026-05-14T08:00:00Z");
    assert.equal(nextCheckpoint(checkpoints)?.days, 0);
  });

  test("null when every point has passed", (t) => {
    at(t, "2026-05-19T08:00:00Z");
    assert.equal(nextCheckpoint(checkpoints), null);
  });

  test("nextTarget falls back to the last target", (t) => {
    const targets = [
      { date: "2026-05-14", share: 40 },
      { date: "2026-05-18", share: 65 },
    ];
    at(t, "2026-05-15T08:00:00Z");
    assert.equal(nextTarget(targets)?.share, 65);
    t.mock.timers.setTime(Date.parse("2026-05-25T08:00:00Z"));
    assert.equal(nextTarget(targets)?.share, 65);
    assert.equal(nextTarget([]), null);
  });
});

describe("fillHours", () => {
  test("fills silent hours with zeros between the first and last reported hour", (t) => {
    // Summer: Dubai is UTC+4, Berlin UTC+2, so the account day starts at 02:00 Dubai time.
    at(t, "2026-09-28T10:00:00Z");
    const out = fillHours([point("05:00", 10), point("08:00", 30)], "Europe/Berlin");
    assert.deepEqual(
      out.map((p) => [p.label, p.impressions]),
      [
        ["05:00", 10],
        ["06:00", 0],
        ["07:00", 0],
        ["08:00", 30],
      ],
    );
  });

  test("keeps the account day order across Dubai midnight", (t) => {
    at(t, "2026-09-28T10:00:00Z");
    // 23:00 Dubai comes before 01:00 Dubai within one Berlin day.
    const out = fillHours([point("01:00", 5), point("23:00", 7)], "Europe/Berlin");
    assert.deepEqual(
      out.map((p) => p.label),
      ["23:00", "00:00", "01:00"],
    );
  });

  test("follows the winter offset", (t) => {
    // Winter: Berlin is UTC+1, so the account day starts at 03:00 Dubai time.
    at(t, "2026-12-10T10:00:00Z");
    const out = fillHours([point("05:00", 1), point("03:00", 2)], "Europe/Berlin");
    assert.deepEqual(
      out.map((p) => p.label),
      ["03:00", "04:00", "05:00"],
    );
  });

  test("adds nothing before the first or after the last hour", (t) => {
    at(t, "2026-09-28T10:00:00Z");
    assert.deepEqual(
      fillHours([point("09:00", 3)], "Europe/Berlin").map((p) => p.label),
      ["09:00"],
    );
    assert.deepEqual(fillHours([], "Europe/Berlin"), []);
    assert.deepEqual(fillHours([point("total", 3)], "Europe/Berlin"), []);
  });
});

describe("lastSevenDays", () => {
  const day = (label: string, impressions: number, reach?: number): SeriesPoint => ({
    label,
    spend: impressions / 100,
    impressions,
    video3s: 0,
    ...(reach == null ? {} : { reach }),
  });

  test("ends today, takes today from the launch series and zero-fills gaps", (t) => {
    at(t, "2026-10-01T10:00:00Z");
    // Meta's last_7d stops at yesterday.
    const week = [day("2026-09-24", 100), day("2026-09-27", 300, 250), day("2026-09-30", 500)];
    const launch = [day("2026-10-01", 700, 600)];
    const out = lastSevenDays(week, launch, "Europe/Berlin");
    assert.deepEqual(
      out.map((p) => p.day),
      ["2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"],
    );
    assert.deepEqual(
      out.map((p) => p.impressions),
      [0, 0, 300, 0, 0, 500, 700],
    );
    assert.equal(out[2].reach, 250);
    assert.equal(out[5].reach, 0);
    assert.equal(out[6].reach, 600);
  });

  test("today depends on the account time zone", (t) => {
    // 22:30 UTC on the 30th is already the 1st in Berlin.
    at(t, "2026-09-30T22:30:00Z");
    assert.equal(lastSevenDays(undefined, undefined, "Europe/Berlin").at(-1)?.day, "2026-10-01");
    assert.equal(lastSevenDays(undefined, undefined, "UTC").at(-1)?.day, "2026-09-30");
  });
});
