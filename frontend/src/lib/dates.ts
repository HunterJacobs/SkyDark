/** Local datetime helpers for <input type="datetime-local"> values. */

export function toDatetimeLocalValue(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localDateTimeToISO(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString();
}

export function eventRangeForDate(center: Date, monthsPad = 1): { start: string; end: string } {
  const start = new Date(center.getFullYear(), center.getMonth() - monthsPad, 1);
  const end = new Date(center.getFullYear(), center.getMonth() + monthsPad + 1, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function defaultLoadRange(pastDays = 45, futureDays = 90): { start: string; end: string } {
  const now = Date.now();
  const start = new Date(now - pastDays * 24 * 60 * 60 * 1000);
  const end = new Date(now + futureDays * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}
