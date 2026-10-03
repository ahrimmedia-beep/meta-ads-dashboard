/**
 * Verdicts over the numbers: is a video strong or weak, which signal is this, is the account blocked by a payment
 * problem. All thresholds come in through `Rules`, nothing is hardcoded here.
 */

import { int, usd } from "./format.ts";
import { type Label, STATUS, statusLabel } from "./labels.ts";
import type { Overview, Period, Row, Rules, Signal } from "./types.ts";

export type Tone = "good" | "warn" | "bad" | "info" | "muted";

/** Worst first: what the owner should look at before the rest. */
export const TONE_ORDER: Tone[] = ["bad", "warn", "info", "good", "muted"];

/** «Сегодня рекламу увидели…» (Today the ads were seen by…) */
export const PERIOD_START: Record<Period, string> = {
  today: "Сегодня",
  yesterday: "Вчера",
  last_7d: "За 7 дней",
  launch: "С запуска",
};

/** «Показы за сегодня» (Impressions today) */
export const PERIOD_OF: Record<Period, string> = {
  today: "за сегодня",
  yesterday: "за вчера",
  last_7d: "за 7 дней",
  launch: "с запуска",
};

/** Budgets and limits are whole dollars: «$50», not «$50,00». */
export function usdShort(n: number | null | undefined) {
  if (n == null) return "—";
  return Number.isInteger(n) ? `$${int(n)}` : usd(n);
}

/** Reach ÷ the middle of Meta's audience estimate, in percent (same formula as the glossary page). */
export function audienceShare(reach: number, audience: Overview["audience"]) {
  if (!audience) return null;
  const middle = (audience.min + audience.max) / 2;
  return middle > 0 ? (reach / middle) * 100 : null;
}

/** "A · r04" → "r04" */
export function shortAdName(name: string) {
  const last = name.split("·").at(-1)?.trim();
  return last && last.length > 0 ? last : name;
}

/** Hook rate verdict by the plan's thresholds; null when there is too little data to judge. */
export function hookTone(rate: number | null, impressions: number, rules: Rules): Tone | null {
  if (rate == null || impressions < rules.minImpressions) return null;
  if (rate >= rules.hookGood) return "good";
  if (rate < rules.hookBad) return "bad";
  return "warn";
}

export interface Verdict {
  tone: Tone;
  chip: string;
  /** Judged by the rules (enough impressions since launch). */
  judged: boolean;
  /** The hook rate since launch the verdict stands on (null until judged). */
  rate: number | null;
}

/** A video's hook rate since launch (`Row.lifetimeHookRate`; null too when an older saved answer lacks the field). */
export function lifetimeHookRate(ad: Row): number | null {
  return ad.lifetimeHookRate ?? null;
}

/**
 * A video's verdict, as the plan asked: on its hook rate since launch and only after `minImpressions` lifetime
 * impressions. The period's hook rate never decides it (blocks show it as information only).
 */
export function adVerdict(ad: Row, rules: Rules): Verdict {
  const life = ad.lifetimeImpressions;
  if (life === 0) return { tone: "muted", chip: "ещё без показов", judged: false, rate: null };
  if (life < rules.minImpressions) {
    return {
      tone: "muted",
      chip: `мало данных · ${int(life)} из ${int(rules.minImpressions)}`,
      judged: false,
      rate: null,
    };
  }
  const rate = lifetimeHookRate(ad);
  if (rate == null) return { tone: "muted", chip: "нет оценки с запуска", judged: false, rate: null };
  if (rate >= rules.hookGood) return { tone: "good", chip: "сильный", judged: true, rate };
  if (rate < rules.hookBad) return { tone: "bad", chip: "слабый", judged: true, rate };
  return { tone: "warn", chip: "средний", judged: true, rate };
}

/** The server's code for a signal (`Signal.kind`); older saved answers without it are classified by their text. */
export function signalKind(signal: Signal): string {
  if (signal.kind) return signal.kind;
  const text = signal.text;
  if (/^Показов пока нет/.test(text)) return "no_delivery";
  if (signal.tone === "bad" && /оплат|billing/i.test(text)) return "billing";
  if (/^С запуска охвачено/.test(text)) return "reach_share";
  if (/^Частота/.test(text)) return signal.tone === "good" ? "frequency_ok" : "frequency_bad";
  if (/^1000 показов стоят/.test(text)) return "cpm_bad";
  if (/^Пока ни у одного ролика нет/.test(text)) return "too_early";
  if (/: досмотр 3 с/.test(text)) return signal.tone === "bad" ? "video_weak" : "video_strong";
  if (/^Начатых переписок/.test(text)) return "messaging";
  return "other";
}

/** Account statuses where Meta holds delivery until the payment is settled. */
const PAYMENT_STATUSES = ["PENDING_BILLING_INFO", "UNSETTLED", "PENDING_SETTLEMENT", "IN_GRACE_PERIOD"];

/**
 * A payment or account problem that stops delivery, as a status label («Payment issue · Проблема с оплатой»):
 * a `billing` signal, a payment status on the account, campaign or ad set, or any other non-active account.
 */
export function accountProblem(data: Overview): Label | null {
  const statuses = [data.account.status, data.campaign?.status, data.adset?.status];
  if (
    data.signals.some((s) => signalKind(s) === "billing") ||
    statuses.some((s) => s && PAYMENT_STATUSES.includes(s))
  ) {
    return STATUS.PENDING_BILLING_INFO;
  }
  const account = data.account.status;
  if (account && account !== "ACTIVE") return { ...statusLabel(account), tone: "bad" };
  return null;
}

/** r01…r10 in natural order. */
export function byName(a: Row, b: Row) {
  return a.name.localeCompare(b.name, "ru", { numeric: true });
}
