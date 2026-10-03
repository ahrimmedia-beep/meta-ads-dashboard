/** A delivery status: the English value as Ads Manager shows it, the Russian translation and a colour tone. */
export interface Label {
  en: string;
  ru: string;
  tone: "good" | "warn" | "bad" | "muted";
}

export const STATUS: Record<string, Label> = {
  ACTIVE: { en: "Active", ru: "Активно", tone: "good" },
  PAUSED: { en: "Off", ru: "Выключено", tone: "muted" },
  CAMPAIGN_PAUSED: { en: "Campaign off", ru: "Кампания выключена", tone: "muted" },
  ADSET_PAUSED: { en: "Ad set off", ru: "Группа выключена", tone: "muted" },
  PENDING_REVIEW: { en: "In review", ru: "На проверке", tone: "warn" },
  IN_PROCESS: { en: "Processing", ru: "Обработка", tone: "warn" },
  PREAPPROVED: { en: "In review", ru: "На проверке", tone: "warn" },
  DISAPPROVED: { en: "Rejected", ru: "Отклонено", tone: "bad" },
  WITH_ISSUES: { en: "Error", ru: "Ошибка", tone: "bad" },
  PENDING_BILLING_INFO: { en: "Payment issue", ru: "Проблема с оплатой", tone: "bad" },
};

export const PREPARING: Label = { en: "Preparing", ru: "Подготовка — ждёт первого показа", tone: "warn" };
export const LEARNING: Label = { en: "Learning", ru: "Обучение", tone: "warn" };

export function statusLabel(status: string, impressions?: number): Label {
  if (status === "ACTIVE" && impressions === 0) return PREPARING;
  return STATUS[status] ?? { en: status, ru: status, tone: "muted" };
}
