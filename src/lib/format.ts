/**
 * Date & number formatting for Kuwait.
 *
 * Calendar dates (attendance days, due dates, incident dates) are stored
 * as SQL `date` and travel as 'YYYY-MM-DD' strings. They are never parsed
 * with the local time zone: we anchor them at UTC midnight and format in
 * UTC, so a date can never shift by a day. Timestamps (`timestamptz`) are
 * displayed in Asia/Kuwait.
 */
export const KUWAIT_TZ = 'Asia/Kuwait';
export const LOCALE = 'ar-KW';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Today's calendar date in Kuwait as YYYY-MM-DD. */
export function kuwaitToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: KUWAIT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function parseIsoDate(value: string): Date {
  if (!isoDate.test(value)) throw new Error(`Invalid ISO date: ${value}`);
  return new Date(`${value}T00:00:00Z`);
}

export function addDays(value: string, days: number): string {
  const d = parseIsoDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseIsoDate(a).getTime() - parseIsoDate(b).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(value: string): number {
  return parseIsoDate(value).getUTCDay();
}

/** Kuwait school week: Sunday–Thursday. */
export function isSchoolDay(value: string): boolean {
  const d = weekday(value);
  return d !== 5 && d !== 6;
}

export function previousSchoolDay(value: string): string {
  let d = value;
  while (!isSchoolDay(d)) d = addDays(d, -1);
  return d;
}

export function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
const shortDateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', day: 'numeric', month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', weekday: 'long' });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: KUWAIT_TZ, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: KUWAIT_TZ, hour: 'numeric', minute: '2-digit' });
const numberFmt = new Intl.NumberFormat(LOCALE);
const percentFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

export function formatDate(value: string | null | undefined): string {
  return value ? dateFmt.format(parseIsoDate(value)) : '—';
}
export function formatShortDate(value: string): string {
  return shortDateFmt.format(parseIsoDate(value));
}
export function formatWeekday(value: string): string {
  return weekdayFmt.format(parseIsoDate(value));
}
export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTimeFmt.format(new Date(value)) : '—';
}
export function formatTime(value: string | null | undefined): string {
  return value ? timeFmt.format(new Date(value)) : '—';
}
export function formatNumber(value: number | null | undefined): string {
  return value == null ? '—' : numberFmt.format(value);
}
export function formatPercent(value: number | null | undefined): string {
  return value == null ? '—' : `${percentFmt.format(value)}٪`;
}

/** Relative description of a timestamp, e.g. "منذ ٥ دقائق". */
export function formatRelative(value: string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(value).getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(Math.round(seconds), 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), 'day');
  return formatDateTime(value);
}
