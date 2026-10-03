/** Shapes of the Python API answers that the modules in this folder work with. */

export type Period = "today" | "yesterday" | "last_7d" | "launch";

export interface Metrics {
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  cpm: number;
  linkClicks: number;
  messaging: number;
  postEngagement: number;
  video3s: number;
  hookRate: number | null;
  thruplay: number;
  p25: number;
  p50: number;
  p75: number;
  p100: number;
  avgWatch: number;
  completeRate: number | null;
  results: number;
  resultLabel: { en: string; ru: string };
  costPerResult: number | null;
  costPerResultPerMille: boolean;
}

export interface Row extends Metrics {
  id: string;
  name: string;
  status: string;
  on: boolean;
  learning: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  budgetLevel: "campaign" | "adset";
  ends: string | null;
  bidStrategy: string | null;
  attribution: string | null;
  objective: string | null;
  goal: string | null;
  thumbnail?: string | null;
  instagramUrl?: string | null;
  previewUrl?: string | null;
  /** Impressions since launch. 0 means Meta has never shown it («Preparing»). */
  lifetimeImpressions: number;
  /** 3-s plays ÷ impressions since launch, 1 decimal, null if lifetimeImpressions is 0. Verdicts (weak/
   *  strong video, signals) are judged on this, never on the period's own hookRate. */
  lifetimeHookRate: number | null;
}

export interface Signal {
  /** Stable code identifying what the signal is about, independent of the Russian text, e.g.
   *  "no_delivery", "billing", "reach_share", "frequency_ok", "frequency_bad", "cpm_bad", "too_early",
   *  "video_weak", "video_strong", "messaging". */
  kind: string;
  tone: "good" | "warn" | "bad" | "info";
  text: string;
}

/** Thresholds from the campaign review (the «plan»). The real values live in a private rules file. */
export interface Rules {
  source: string;
  minImpressions: number;
  hookGood: number;
  hookBad: number;
  frequencyOk: number;
  frequencyBad: number;
  cpmBad: number;
  dailyBudgetMax: number;
  reachTargets: { date: string; share: number }[];
  /** The plan's control points by date. */
  checkpoints: { date: string; title: string; note: string }[];
}

export interface Overview {
  updatedAt: string;
  period: Period;
  account: {
    name: string;
    status: string;
    currency: string;
    timezone: string;
    amountSpent: number | null;
    spendCap: number | null;
    payment: string | null;
  };
  campaign: (Row & { spendCap: number | null; start: string | null; stop: string | null; spentTotal: number }) | null;
  adset: (Row & { frequencyCap: string | null }) | null;
  audience: { min: number; max: number } | null;
  total: Metrics;
  /** Unique people reached since launch. The plan's reach targets are measured on this. */
  launchReach: number;
  ads: Row[];
  signals: Signal[];
  rules: Rules;
  /** Set when Meta refused a read and saved data is shown instead. */
  stale?: string;
}

export interface SeriesPoint {
  label: string;
  spend: number;
  impressions: number;
  reach?: number;
  video3s: number;
}
