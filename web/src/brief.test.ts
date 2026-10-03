import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { type BriefItem, briefItems, videosInOrder } from "./brief.ts";
import { ad, metrics, overview, RULES } from "./fixtures.ts";

const ids = (items: BriefItem[]) => items.map((i) => i.id);
const find = (items: BriefItem[], id: string) => {
  const item = items.find((i) => i.id === id);
  assert.ok(item, `no item ${id} in ${ids(items).join(", ")}`);
  return item;
};

describe("order", () => {
  test("a payment problem goes first, then worst tone first, server order kept within a tone", () => {
    const items = briefItems(
      overview({
        total: metrics({ impressions: 1200, frequency: 3.4, cpm: 18, linkClicks: 7 }),
        signals: [
          { kind: "frequency_bad", tone: "bad", text: "Частота 3.4 — люди видят рекламу слишком часто (порог 3)." },
          { kind: "cpm_bad", tone: "bad", text: "1000 показов стоят $18.00 — дороже порога $15." },
          { kind: "billing", tone: "bad", text: "Проблема с оплатой — откройте Billing & payments." },
        ],
      }),
    );
    assert.deepEqual(ids(items), ["billing", "signal-0", "signal-1", "no-messages"]);
  });
});

describe("lines from server signals", () => {
  test("billing splits the server text into a title and a hint", () => {
    const items = briefItems(
      overview({ signals: [{ kind: "billing", tone: "bad", text: "Проблема с оплатой — откройте Billing & payments." }] }),
    );
    const billing = find(items, "billing");
    assert.equal(billing.title, "Проблема с оплатой");
    assert.equal(billing.meta, "откройте Billing & payments.");
    assert.equal(billing.icon, "CreditCard");
    assert.equal(billing.href, "/dashboard/glossary#paymentMethod");
  });

  test("no delivery is an alarm today and a plain fact for a past period", () => {
    const signal = { kind: "no_delivery", tone: "warn" as const, text: "Показов пока нет." };

    const today = find(briefItems(overview({ period: "today", signals: [signal] })), "signal-0");
    assert.equal(today.tone, "warn");
    assert.equal(today.title, "Показов пока нет");
    assert.equal(today.aside, "сначала — Billing & payments");

    const yesterday = find(briefItems(overview({ period: "yesterday", signals: [signal] })), "signal-0");
    assert.equal(yesterday.tone, "info");
    assert.equal(yesterday.title, "Вчера показов не было");
    assert.equal(yesterday.aside, undefined);
  });

  test("frequency and CPM lines use the numbers and the thresholds", () => {
    const items = briefItems(
      overview({
        total: metrics({ frequency: 3.4, cpm: 18 }),
        signals: [
          { kind: "frequency_bad", tone: "bad", text: "" },
          { kind: "cpm_bad", tone: "bad", text: "" },
        ],
      }),
    );
    const frequency = find(items, "signal-0");
    assert.equal(frequency.title, "Частота 3,40 — высокая");
    assert.equal(frequency.meta, "люди видят рекламу слишком часто — порог 3,00");
    assert.equal(frequency.chip, "часто");
    assert.equal(frequency.href, "/dashboard/glossary#frequency");

    const cpm = find(items, "signal-1");
    assert.equal(cpm.title, "1000 показов стоят $18,00");
    assert.equal(cpm.chip, "дороже $15");
  });

  test("normal frequency is a good line", () => {
    const items = briefItems(
      overview({ total: metrics({ frequency: 1.4 }), signals: [{ kind: "frequency_ok", tone: "good", text: "" }] }),
    );
    const line = find(items, "signal-0");
    assert.equal(line.title, "Частота 1,40 — норма");
    assert.equal(line.tone, "good");
    assert.equal(line.aside, "норма до 2");
  });

  test("reach share and per-video signals are shown elsewhere, not as lines", () => {
    const items = briefItems(
      overview({
        signals: [
          { kind: "reach_share", tone: "info", text: "С запуска охвачено ~42% аудитории." },
          { kind: "video_weak", tone: "bad", text: "A · r02: досмотр 3 с 8% (с запуска)" },
          { kind: "video_strong", tone: "good", text: "A · r01: досмотр 3 с 35% (с запуска)" },
        ],
      }),
    );
    assert.deepEqual(items, []);
  });

  test("too early to judge counts the videos that already have impressions", () => {
    const items = briefItems(
      overview({
        ads: [ad("r01", { lifetimeImpressions: 50 }), ad("r02", { status: "PAUSED" })],
        signals: [{ kind: "too_early", tone: "info", text: "" }],
      }),
    );
    const line = find(items, "signal-0");
    assert.equal(line.meta, "ни у одного ролика пока нет 400 показов");
    assert.equal(line.aside, "с показами 1 из 2 роликов");
  });

  test("an unknown signal is shown as is, split into title and hint", () => {
    const items = briefItems(
      overview({ signals: [{ kind: "something_new", tone: "warn", text: "Что-то новое. Подробности ниже" }] }),
    );
    const line = find(items, "signal-0");
    assert.equal(line.title, "Что-то новое.");
    assert.equal(line.meta, "Подробности ниже");
    assert.equal(line.chip, "внимание");
    assert.equal(line.icon, "TriangleAlert");
  });
});

describe("lines about videos", () => {
  const judged = [
    ad("r01", { lifetimeImpressions: 900, lifetimeHookRate: 35, impressions: 200, hookRate: 40 }),
    ad("r02", { lifetimeImpressions: 900, lifetimeHookRate: 8, impressions: 200, hookRate: 9.5 }),
    ad("r03", { lifetimeImpressions: 900, lifetimeHookRate: 20, impressions: 0, hookRate: null }),
    ad("r04", { lifetimeImpressions: 100, lifetimeHookRate: 50, impressions: 100, hookRate: 50 }),
  ];

  test("judged videos come weakest first; videos with too few impressions are skipped", () => {
    const items = briefItems(overview({ ads: judged }));
    assert.deepEqual(ids(items), ["ad-r02", "ad-r03", "ad-r01"]);
    assert.deepEqual(
      items.map((i) => [i.tone, i.chip, i.icon]),
      [
        ["bad", "слабый", "CircleX"],
        ["warn", "средний", "Play"],
        ["good", "сильный", "ThumbsUp"],
      ],
    );
  });

  test("the verdict uses the rate since launch and mentions the period's rate", () => {
    const items = briefItems(overview({ period: "today", ads: judged }));
    const weak = find(items, "ad-r02");
    assert.equal(weak.title, "r02: досмотр 3 с 8% с запуска");
    assert.equal(weak.meta, "кандидат на выключение — решение за владельцем · сегодня 9,5%");
    assert.equal(weak.aside, "900 показов с запуска");
    assert.equal(weak.video, "r02");
    assert.equal(find(items, "ad-r03").meta, "средне — между 12% и 30%");

    const sinceLaunch = briefItems(overview({ period: "launch", ads: judged }));
    assert.equal(find(sinceLaunch, "ad-r01").meta, "сильный ролик — цепляет с первых секунд");
  });

  test("before any verdict, the period's leader is shown with the data still needed", () => {
    const items = briefItems(
      overview({
        ads: [
          ad("r01", { lifetimeImpressions: 150, impressions: 150, hookRate: 20 }),
          ad("r02", { lifetimeImpressions: 300, impressions: 21, hookRate: 25 }),
          ad("r03"),
        ],
      }),
    );
    assert.deepEqual(ids(items), ["lead-r02", "ads-waiting"]);
    const leader = find(items, "lead-r02");
    assert.equal(leader.title, "Лидер по досмотру 3 с — r02, 25%");
    assert.equal(leader.meta, "300 из 400 показов — оценка после 400");
    assert.equal(leader.aside, "21 показ сегодня");
    assert.equal(find(items, "ads-waiting").title, "r03 ещё без показов");
  });

  test("on a tie the leader is the video with more impressions", () => {
    const items = briefItems(
      overview({
        ads: [
          ad("r01", { lifetimeImpressions: 30, impressions: 3, hookRate: 25 }),
          ad("r02", { lifetimeImpressions: 30, impressions: 12, hookRate: 25 }),
        ],
      }),
    );
    assert.equal(items[0].id, "lead-r02");
    assert.equal(items[0].aside, "12 показов сегодня");
  });

  test("rejected and in-review videos are grouped, long name lists are cut", () => {
    const items = briefItems(
      overview({
        ads: [
          ad("r01", { status: "DISAPPROVED" }),
          ad("r02", { status: "DISAPPROVED" }),
          ad("r03", { status: "DISAPPROVED" }),
          ad("r04", { status: "DISAPPROVED" }),
          ad("r05", { status: "WITH_ISSUES" }),
          ad("r06", { status: "PENDING_REVIEW" }),
          ad("r07", { status: "IN_PROCESS" }),
        ],
      }),
    );
    assert.deepEqual(ids(items), ["ads-DISAPPROVED", "ads-WITH_ISSUES", "ads-review"]);
    const rejected = find(items, "ads-DISAPPROVED");
    assert.equal(rejected.title, "r01, r02, r03 и ещё 1: отклонено");
    assert.equal(rejected.chip, "4 ролика");
    assert.equal(find(items, "ads-WITH_ISSUES").chip, "1 ролик");
    assert.equal(find(items, "ads-review").title, "r06, r07: на проверке у Meta");
  });
});

describe("other lines", () => {
  test("the next control point, by the Dubai date", (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-05-12T21:30:00Z") });
    const rules = {
      ...RULES,
      checkpoints: [
        { date: "2026-05-12", title: "Первая проверка", note: "Показы хотя бы у 3 роликов" },
        { date: "2026-05-14", title: "Выбор роликов", note: "Оставить лучшие по досмотру 3 с" },
      ],
    };
    const line = find(briefItems(overview({ rules })), "checkpoint");
    assert.equal(line.title, "14.05 — выбор роликов");
    assert.equal(line.meta, "Оставить лучшие по досмотру 3 с");
    assert.equal(line.chip, "завтра");
    assert.equal(line.href, "#campaign-path");
  });

  test("no messages yet: a quiet last line with the button clicks", () => {
    const items = briefItems(overview({ total: metrics({ impressions: 500, linkClicks: 3 }) }));
    assert.deepEqual(ids(items), ["no-messages"]);
    assert.equal(items[0].tone, "muted");
    assert.equal(items[0].meta, "нажали «Отправить сообщение»: 3");
  });

  test("messages started replace the empty line", () => {
    const items = briefItems(
      overview({
        total: metrics({ impressions: 500, messaging: 2 }),
        signals: [{ kind: "messaging", tone: "good", text: "" }],
      }),
    );
    assert.deepEqual(ids(items), ["signal-0"]);
    assert.equal(items[0].title, "Написали в Direct: 2");
  });
});

test("videosInOrder sorts by name without changing the input", () => {
  const data = overview({ ads: [ad("r10"), ad("r2"), ad("r1")] });
  assert.deepEqual(
    videosInOrder(data).map((a) => a.id),
    ["r1", "r2", "r10"],
  );
  assert.deepEqual(
    data.ads.map((a) => a.id),
    ["r10", "r2", "r1"],
  );
});
