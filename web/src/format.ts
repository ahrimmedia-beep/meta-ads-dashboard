/** Number and date formatting for the dashboard. The interface is in Russian, so numbers use the ru-RU locale. */

const intFmt = new Intl.NumberFormat("ru-RU");
const decFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const oneFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export const int = (n: number | null | undefined) => (n == null ? "—" : intFmt.format(n));
export const usd = (n: number | null | undefined) => (n == null ? "—" : `$${decFmt.format(n)}`);
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${oneFmt.format(n)}%`);
export const dec = (n: number | null | undefined) => (n == null ? "—" : decFmt.format(n));
export const one = (n: number | null | undefined) => (n == null ? "—" : oneFmt.format(n));

/** Meta returns times with an offset; show them in Dubai time, as the owner lives there. */
export function dubaiDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "long",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

export function dubaiTime(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/** Russian noun agreement: 1 показ, 2–4 показа, 5+ and 11–14 показов. */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
