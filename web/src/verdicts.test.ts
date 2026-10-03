import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ad, metrics, overview, RULES } from "./fixtures.ts";
import { PREPARING, STATUS, statusLabel } from "./labels.ts";
import type { Signal } from "./types.ts";
import {
  accountProblem,
  adVerdict,
  audienceShare,
  byName,
  hookTone,
  shortAdName,
  signalKind,
  usdShort,
} from "./verdicts.ts";

describe("small helpers", () => {
  test("usdShort drops cents only for whole dollars", () => {
    assert.equal(usdShort(50), "$50");
    assert.equal(usdShort(7.5), "$7,50");
    assert.equal(usdShort(null), "—");
  });

  test("audienceShare measures reach against the middle of Meta's estimate", () => {
    assert.equal(audienceShare(500, { min: 800, max: 1200 }), 50);
    assert.equal(audienceShare(500, null), null);
    assert.equal(audienceShare(500, { min: 0, max: 0 }), null);
  });

  test("shortAdName keeps the part after the last dot separator", () => {
    assert.equal(shortAdName("A · r04"), "r04");
    assert.equal(shortAdName("Reach · B · r10"), "r10");
    assert.equal(shortAdName("r04"), "r04");
    assert.equal(shortAdName("A · "), "A · ");
  });

  test("byName sorts r1, r2, r10 in natural order", () => {
    const sorted = [ad("r10"), ad("r2"), ad("r1")].sort(byName).map((a) => a.name);
    assert.deepEqual(sorted, ["A · r1", "A · r2", "A · r10"]);
  });
});

describe("statusLabel", () => {
  test("an active ad that Meta has never shown is «Preparing»", () => {
    assert.equal(statusLabel("ACTIVE", 0), PREPARING);
    assert.equal(statusLabel("ACTIVE", 12), STATUS.ACTIVE);
    assert.equal(statusLabel("ACTIVE"), STATUS.ACTIVE);
  });

  test("an unknown status is shown as Meta sent it", () => {
    assert.deepEqual(statusLabel("ARCHIVED"), { en: "ARCHIVED", ru: "ARCHIVED", tone: "muted" });
  });
});

describe("hookTone", () => {
  test("no verdict without a rate or before enough impressions", () => {
    assert.equal(hookTone(null, 5000, RULES), null);
    assert.equal(hookTone(50, RULES.minImpressions - 1, RULES), null);
  });

  test("good from hookGood, bad below hookBad, warn in between", () => {
    const n = RULES.minImpressions;
    assert.equal(hookTone(RULES.hookGood, n, RULES), "good");
    assert.equal(hookTone(RULES.hookGood - 0.1, n, RULES), "warn");
    assert.equal(hookTone(RULES.hookBad, n, RULES), "warn");
    assert.equal(hookTone(RULES.hookBad - 0.1, n, RULES), "bad");
  });
});

describe("adVerdict", () => {
  test("a video Meta has never shown", () => {
    assert.deepEqual(adVerdict(ad("r01"), RULES), { tone: "muted", chip: "ещё без показов", judged: false, rate: null });
  });

  test("too few impressions since launch: shows the progress, no verdict", () => {
    const v = adVerdict(ad("r01", { lifetimeImpressions: 120, lifetimeHookRate: 50 }), RULES);
    assert.equal(v.judged, false);
    assert.equal(v.chip, "мало данных · 120 из 400");
  });

  test("an older saved answer without the lifetime rate", () => {
    const v = adVerdict(ad("r01", { lifetimeImpressions: 900, lifetimeHookRate: null }), RULES);
    assert.equal(v.chip, "нет оценки с запуска");
    assert.equal(v.judged, false);
  });

  test("judged on the rate since launch, never on the period's rate", () => {
    const weak = ad("r01", { lifetimeImpressions: 900, lifetimeHookRate: 10, hookRate: 60 });
    assert.deepEqual(adVerdict(weak, RULES), { tone: "bad", chip: "слабый", judged: true, rate: 10 });

    const strong = ad("r02", { lifetimeImpressions: 900, lifetimeHookRate: 35, hookRate: 5 });
    assert.deepEqual(adVerdict(strong, RULES), { tone: "good", chip: "сильный", judged: true, rate: 35 });

    const average = ad("r03", { lifetimeImpressions: 900, lifetimeHookRate: 20 });
    assert.equal(adVerdict(average, RULES).chip, "средний");
  });

  test("uses the same bounds as hookTone: hookGood is strong, hookBad is not weak", () => {
    const at = (rate: number) => ad("r01", { lifetimeImpressions: RULES.minImpressions, lifetimeHookRate: rate });
    assert.equal(adVerdict(at(RULES.hookGood), RULES).tone, "good");
    assert.equal(adVerdict(at(RULES.hookBad), RULES).tone, "warn");
  });
});

describe("signalKind", () => {
  const legacy = (text: string, tone: Signal["tone"] = "info"): Signal => ({ kind: "", tone, text });

  test("trusts the server's code when there is one", () => {
    assert.equal(signalKind({ kind: "cpm_bad", tone: "bad", text: "anything" }), "cpm_bad");
  });

  test("classifies older answers by their text", () => {
    assert.equal(signalKind(legacy("Показов пока нет. Если так дольше суток…", "warn")), "no_delivery");
    assert.equal(signalKind(legacy("Проблема с оплатой — откройте Billing & payments.", "bad")), "billing");
    assert.equal(signalKind(legacy("С запуска охвачено ~42% аудитории.")), "reach_share");
    assert.equal(signalKind(legacy("Частота 1.40 — норма (до 2).", "good")), "frequency_ok");
    assert.equal(signalKind(legacy("Частота 3.2 — люди видят рекламу слишком часто", "bad")), "frequency_bad");
    assert.equal(signalKind(legacy("1000 показов стоят $21.00 — дороже порога $15.", "bad")), "cpm_bad");
    assert.equal(signalKind(legacy("Пока ни у одного ролика нет 400 показов")), "too_early");
    assert.equal(signalKind(legacy("A · r04: досмотр 3 с 9% (с запуска)", "bad")), "video_weak");
    assert.equal(signalKind(legacy("A · r05: досмотр 3 с 33% (с запуска)", "good")), "video_strong");
    assert.equal(signalKind(legacy("Начатых переписок: 2.", "good")), "messaging");
    assert.equal(signalKind(legacy("Something new")), "other");
  });

  test("a payment word is a billing signal only when the tone is bad", () => {
    assert.equal(signalKind(legacy("Проверьте оплату", "info")), "other");
  });
});

describe("accountProblem", () => {
  test("none for an active account without payment signals", () => {
    assert.equal(accountProblem(overview()), null);
  });

  test("a billing signal means a payment issue", () => {
    const data = overview({ signals: [{ kind: "billing", tone: "bad", text: "Проблема с оплатой" }] });
    assert.equal(accountProblem(data), STATUS.PENDING_BILLING_INFO);
  });

  test("a payment status on the account or the ad set means a payment issue", () => {
    const base = overview();
    assert.equal(accountProblem({ ...base, account: { ...base.account, status: "UNSETTLED" } }), STATUS.PENDING_BILLING_INFO);
    const adset = { ...ad("set"), ...metrics(), status: "PENDING_BILLING_INFO", frequencyCap: null };
    assert.equal(accountProblem({ ...base, adset }), STATUS.PENDING_BILLING_INFO);
  });

  test("any other non-active account status is shown in red", () => {
    const base = overview();
    const label = accountProblem({ ...base, account: { ...base.account, status: "DISABLED" } });
    assert.deepEqual(label, { en: "DISABLED", ru: "DISABLED", tone: "bad" });
    const review = accountProblem({ ...base, account: { ...base.account, status: "PENDING_REVIEW" } });
    assert.deepEqual(review, { ...STATUS.PENDING_REVIEW, tone: "bad" });
  });
});
