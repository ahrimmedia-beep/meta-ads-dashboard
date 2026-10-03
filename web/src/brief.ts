/**
 * «Что важно сейчас» (What matters now): the list on the overview page. It merges the server's signals, per-video
 * verdicts, delivery statuses and the next control point into one list, worst first. The interface is in Russian;
 * every Meta term keeps its English name from Ads Manager.
 */

import { dueIn, nextCheckpoint, shortDate } from "./dates.ts";
import { dec, int, pct, plural, usd } from "./format.ts";
import { STATUS } from "./labels.ts";
import type { Overview, Row, Signal } from "./types.ts";
import {
  adVerdict,
  byName,
  PERIOD_START,
  shortAdName,
  signalKind,
  TONE_ORDER,
  type Tone,
  usdShort,
} from "./verdicts.ts";

/**
 * Icon names from lucide-react. In the app this field holds the icon component itself; here it is the name, so the
 * module has no UI dependency and runs under plain Node.
 */
export type IconName =
  | "CalendarClock"
  | "CircleX"
  | "Clock"
  | "CreditCard"
  | "EyeOff"
  | "Film"
  | "Info"
  | "MessageCircle"
  | "Play"
  | "Receipt"
  | "Repeat"
  | "ThumbsUp"
  | "TriangleAlert";

/** Where a line leads: the videos table, a term on the glossary page («Словарь»), the path card on this page. */
const ADS_MANAGER = "/dashboard/ads-manager";
const term = (key: string) => `/dashboard/glossary#${key}`;

/** One line of the list. */
export interface BriefItem {
  id: string;
  tone: Tone;
  icon: IconName;
  /** A video's short number («r04») for the avatar; otherwise the icon is the avatar. */
  video?: string;
  /** The video's cover, when Meta gives one. */
  thumb?: string | null;
  title: string;
  meta: string;
  chip: string;
  /** Secondary info next to the chip on the highlighted card. */
  aside?: string;
  /** Instagram (external), a dashboard page or an anchor on this page; no link → a plain line. */
  href?: string | null;
}

const PERIOD_OF_SHORT: Record<Overview["period"], string> = {
  today: "сегодня",
  yesterday: "вчера",
  last_7d: "за 7 дней",
  launch: "с запуска",
};

const TONE_WORD: Record<Tone, string> = {
  good: "хорошо",
  warn: "внимание",
  bad: "плохо",
  info: "к сведению",
  muted: "—",
};

const VERDICT_ICON: Record<Tone, IconName> = {
  bad: "CircleX",
  good: "ThumbsUp",
  warn: "Play",
  info: "Play",
  muted: "Play",
};

const SIGNAL_ICON: Record<Signal["tone"], IconName> = {
  good: "ThumbsUp",
  warn: "TriangleAlert",
  bad: "CircleX",
  info: "Info",
};

/** Server signals (plain Russian from the plan's rules) → title / meta / chips. Unknown texts are shown as is. */
function fromSignal(signal: Signal, index: number, data: Overview): BriefItem | null {
  const { total, rules } = data;
  const text = signal.text;
  const kind = signalKind(signal);
  const base = { id: `signal-${index}`, tone: signal.tone };

  if (kind === "billing") {
    // Meta holds delivery until the payment goes through: always the first line.
    const [head, ...rest] = text.split(/(?<=\.)\s+|\s+—\s+/);
    return {
      ...base,
      id: "billing",
      tone: "bad",
      icon: "CreditCard",
      title: head || "Проблема с оплатой",
      meta: rest.join(" ") || "Проверьте Billing & payments в Meta",
      chip: "оплата",
      aside: "Payment issue · Проблема с оплатой",
      href: term("paymentMethod"),
    };
  }
  if (kind === "no_delivery") {
    // The server says it about the chosen period; for a past period it is a fact, not an alarm.
    const now = data.period === "today" || data.period === "launch";
    return {
      ...base,
      tone: now ? signal.tone : "info",
      icon: "EyeOff",
      title: now ? "Показов пока нет" : `${PERIOD_START[data.period]} показов не было`,
      meta: now
        ? "Если так дольше суток — сначала проверьте оплату (Billing & payments)"
        : "за этот период Meta рекламу не показывала",
      chip: "0 показов",
      aside: now ? "сначала — Billing & payments" : undefined,
      href: ADS_MANAGER,
    };
  }
  // Reach ÷ audience is the card's hero (`ReachGoal`), not a line.
  if (kind === "reach_share") return null;
  if (kind === "frequency_ok" || kind === "frequency_bad") {
    const high = kind === "frequency_bad";
    return {
      ...base,
      icon: "Repeat",
      title: `Частота ${dec(total.frequency)} — ${high ? "высокая" : "норма"}`,
      meta: high
        ? `люди видят рекламу слишком часто — порог ${dec(rules.frequencyBad)}`
        : `сколько раз в среднем человек видел рекламу; норма до ${int(rules.frequencyOk)}`,
      chip: high ? "часто" : "норма",
      aside: `норма до ${int(rules.frequencyOk)}`,
      href: term("frequency"),
    };
  }
  if (kind === "cpm_bad") {
    return {
      ...base,
      icon: "Receipt",
      title: `1000 показов стоят ${usd(total.cpm)}`,
      meta: `дороже порога ${usdShort(rules.cpmBad)} — стоит снизить бюджет`,
      chip: `дороже ${usdShort(rules.cpmBad)}`,
      href: term("cpm"),
    };
  }
  if (kind === "too_early") {
    return {
      ...base,
      icon: "Film",
      title: "Выводы по роликам рано делать",
      meta: `ни у одного ролика пока нет ${int(rules.minImpressions)} показов`,
      chip: "мало данных",
      aside: `с показами ${data.ads.filter((a) => a.lifetimeImpressions > 0).length} из ${data.ads.length} роликов`,
      href: ADS_MANAGER,
    };
  }
  // Per-video verdicts come from the videos themselves (with the thumbnail and the Instagram link).
  if (kind === "video_weak" || kind === "video_strong") return null;
  if (kind === "messaging") {
    return {
      ...base,
      icon: "MessageCircle",
      title: `Написали в Direct: ${int(total.messaging)}`,
      meta: "Отвечайте в течение часа по скрипту продаж",
      chip: int(total.messaging),
      href: term("messaging"),
    };
  }
  const [head, ...rest] = text.split(/(?<=\.)\s+|\s+—\s+/);
  return {
    ...base,
    icon: SIGNAL_ICON[signal.tone],
    title: head,
    meta: rest.join(" "),
    chip: TONE_WORD[signal.tone],
  };
}

function names(ads: Row[]) {
  const list = ads.map((a) => shortAdName(a.name));
  return list.length > 3 ? `${list.slice(0, 3).join(", ")} и ещё ${list.length - 3}` : list.join(", ");
}

/** Per-video lines: judged videos by the rules; before that, the current leader and the ones without impressions. */
function fromVideos(data: Overview): BriefItem[] {
  const { ads, rules } = data;
  const out: BriefItem[] = [];
  // Verdicts stand on the hook rate since launch; the period's rate is only mentioned.
  const judged = ads
    .map((ad) => ({ ad, v: adVerdict(ad, rules) }))
    .filter(({ v }) => v.judged)
    .sort((a, b) => (a.v.rate ?? 0) - (b.v.rate ?? 0));

  for (const { ad, v } of judged) {
    const short = shortAdName(ad.name);
    let meta = `средне — между ${rules.hookBad}% и ${rules.hookGood}%`;
    if (v.tone === "bad") meta = "кандидат на выключение — решение за владельцем";
    else if (v.tone === "good") meta = "сильный ролик — цепляет с первых секунд";
    if (data.period !== "launch" && ad.hookRate != null)
      meta += ` · ${PERIOD_OF_SHORT[data.period]} ${pct(ad.hookRate)}`;
    out.push({
      id: `ad-${ad.id}`,
      tone: v.tone,
      icon: VERDICT_ICON[v.tone],
      video: short,
      thumb: ad.thumbnail,
      title: `${short}: досмотр 3 с ${pct(v.rate)} с запуска`,
      meta,
      chip: v.chip,
      aside: `${int(ad.lifetimeImpressions)} показов с запуска`,
      href: ad.instagramUrl,
    });
  }

  if (judged.length === 0) {
    const shown = ads.filter((a) => a.impressions > 0 && a.hookRate != null);
    const leader = [...shown].sort((a, b) => (b.hookRate ?? 0) - (a.hookRate ?? 0) || b.impressions - a.impressions)[0];
    if (leader) {
      const short = shortAdName(leader.name);
      const life = leader.lifetimeImpressions;
      out.push({
        id: `lead-${leader.id}`,
        tone: "info",
        icon: "Play",
        video: short,
        thumb: leader.thumbnail,
        title: `Лидер по досмотру 3 с — ${short}, ${pct(leader.hookRate)}`,
        meta: `${int(life)} из ${int(rules.minImpressions)} показов — оценка после ${int(rules.minImpressions)}`,
        chip: "мало данных",
        aside: `${int(leader.impressions)} ${plural(leader.impressions, "показ", "показа", "показов")} ${PERIOD_OF_SHORT[data.period]}`,
        href: leader.instagramUrl,
      });
    }
  }

  for (const status of ["DISAPPROVED", "WITH_ISSUES"]) {
    const hit = ads.filter((a) => a.status === status);
    if (hit.length === 0) continue;
    const label = STATUS[status];
    out.push({
      id: `ads-${status}`,
      tone: "bad",
      icon: "CircleX",
      title: `${names(hit)}: ${label.ru.toLowerCase()}`,
      meta: `${label.en} · ${label.ru} — нужно разобраться`,
      chip: `${hit.length} ${plural(hit.length, "ролик", "ролика", "роликов")}`,
      href: ADS_MANAGER,
    });
  }
  const review = ads.filter((a) => ["PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED"].includes(a.status));
  if (review.length > 0) {
    out.push({
      id: "ads-review",
      tone: "warn",
      icon: "Clock",
      title: `${names(review)}: на проверке у Meta`,
      meta: "In review · На проверке — обычно до суток",
      chip: `${review.length} ${plural(review.length, "ролик", "ролика", "роликов")}`,
      href: ADS_MANAGER,
    });
  }
  const waiting = ads.filter((a) => a.status === "ACTIVE" && a.lifetimeImpressions === 0);
  if (waiting.length > 0) {
    out.push({
      id: "ads-waiting",
      tone: "info",
      icon: "Clock",
      title: `${names(waiting)} ещё без показов`,
      meta: "Preparing · Подготовка — ждёт первого показа",
      chip: `${waiting.length} ${plural(waiting.length, "ролик", "ролика", "роликов")}`,
      href: ADS_MANAGER,
    });
  }
  return out;
}

/** The plan's next control point: «14.05 — выбор роликов» (pick the videos) · «сегодня» / «через 2 дн.». */
function checkpointLine(data: Overview): BriefItem | null {
  const point = nextCheckpoint(data.rules.checkpoints);
  if (!point) return null;
  return {
    id: "checkpoint",
    tone: "info",
    icon: "CalendarClock",
    title: `${shortDate(point.date)} — ${point.title.charAt(0).toLowerCase()}${point.title.slice(1)}`,
    meta: point.note,
    chip: dueIn(point.days),
    aside: "контрольная точка плана",
    href: "#campaign-path",
  };
}

/** Everything worth a look, worst first; the first one is the featured card. */
export function briefItems(data: Overview): BriefItem[] {
  const items: BriefItem[] = [];
  data.signals.forEach((signal, index) => {
    const item = fromSignal(signal, index, data);
    if (item) items.push(item);
  });
  items.push(...fromVideos(data));
  const checkpoint = checkpointLine(data);
  if (checkpoint) items.push(checkpoint);
  const { total } = data;
  if (total.messaging === 0 && total.impressions > 0) {
    items.push({
      id: "no-messages",
      tone: "muted",
      icon: "MessageCircle",
      title: "В Direct пока не писали",
      meta: `нажали «Отправить сообщение»: ${int(total.linkClicks)}`,
      chip: "0 сообщений",
      href: term("messaging"),
    });
  }
  // A payment problem goes first, then worst tone first.
  const rank = (item: BriefItem) => (item.id === "billing" ? -1 : TONE_ORDER.indexOf(item.tone));
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);
}

/** Videos in natural order, the same order in every block. */
export function videosInOrder(data: Overview) {
  return [...data.ads].sort(byName);
}
