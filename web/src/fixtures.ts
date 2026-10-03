/** Test data builders. The numbers are made up; the thresholds are examples, not the real campaign rules. */

import type { Metrics, Overview, Row, Rules } from "./types.ts";

export const RULES: Rules = {
  source: "example thresholds for tests",
  minImpressions: 400,
  hookGood: 30,
  hookBad: 12,
  frequencyOk: 2,
  frequencyBad: 3,
  cpmBad: 15,
  dailyBudgetMax: 50,
  reachTargets: [],
  checkpoints: [],
};

export function metrics(over: Partial<Metrics> = {}): Metrics {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    frequency: 0,
    cpm: 0,
    linkClicks: 0,
    messaging: 0,
    postEngagement: 0,
    video3s: 0,
    hookRate: null,
    thruplay: 0,
    p25: 0,
    p50: 0,
    p75: 0,
    p100: 0,
    avgWatch: 0,
    completeRate: null,
    results: 0,
    resultLabel: { en: "Reach", ru: "Охват" },
    costPerResult: null,
    costPerResultPerMille: true,
    ...over,
  };
}

/** An ad row named like the real ones: "A · r01". */
export function ad(short: string, over: Partial<Row> = {}): Row {
  return {
    ...metrics(),
    id: short,
    name: `A · ${short}`,
    status: "ACTIVE",
    on: true,
    learning: null,
    dailyBudget: null,
    lifetimeBudget: null,
    budgetLevel: "adset",
    ends: null,
    bidStrategy: null,
    attribution: null,
    objective: "OUTCOME_AWARENESS",
    goal: "REACH",
    lifetimeImpressions: 0,
    lifetimeHookRate: null,
    ...over,
  };
}

export function overview(over: Partial<Overview> = {}): Overview {
  return {
    updatedAt: "2026-09-28T12:00:00+04:00",
    period: "today",
    account: {
      name: "Test account",
      status: "ACTIVE",
      currency: "USD",
      timezone: "Europe/Berlin",
      amountSpent: null,
      spendCap: null,
      payment: null,
    },
    campaign: null,
    adset: null,
    audience: null,
    total: metrics(),
    launchReach: 0,
    ads: [],
    signals: [],
    rules: RULES,
    ...over,
  };
}
