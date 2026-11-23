import type { WeekKey } from '../types';

export const TIME_ZONE = 'Europe/Amsterdam';

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

export interface IsoWeek {
  year: number;
  week: number;
}

/** The calendar date in the Europe/Amsterdam time zone at `instant`. */
export function amsterdamDate(instant: Date): CalendarDate & { weekday: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const date = { year: get('year'), month: get('month'), day: get('day') };
  return { ...date, weekday: isoWeekday(date) };
}

function toUtc(d: CalendarDate): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day));
}

function fromUtc(d: Date): CalendarDate {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 1 = Monday … 7 = Sunday */
export function isoWeekday(d: CalendarDate): number {
  const wd = toUtc(d).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function addDays(d: CalendarDate, days: number): CalendarDate {
  const u = toUtc(d);
  u.setUTCDate(u.getUTCDate() + days);
  return fromUtc(u);
}

/** ISO-8601 week number: weeks start Monday, week 1 contains the year's first Thursday. */
export function isoWeekOf(d: CalendarDate): IsoWeek {
  const thursday = addDays(d, 4 - isoWeekday(d));
  const jan1 = toUtc({ year: thursday.year, month: 1, day: 1 });
  const dayOfYear = Math.round((toUtc(thursday).getTime() - jan1.getTime()) / 86_400_000);
  return { year: thursday.year, week: Math.floor(dayOfYear / 7) + 1 };
}

export function weekKey(w: IsoWeek): WeekKey {
  return `${w.year}-W${String(w.week).padStart(2, '0')}`;
}

export function parseWeekKey(key: WeekKey): IsoWeek {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) throw new Error(`Invalid week key: ${key}`);
  return { year: Number(m[1]), week: Number(m[2]) };
}

/** Monday of the given ISO week. */
export function mondayOf(key: WeekKey): CalendarDate {
  const { year, week } = parseWeekKey(key);
  const jan4 = { year, month: 1, day: 4 };
  const week1Monday = addDays(jan4, 1 - isoWeekday(jan4));
  return addDays(week1Monday, (week - 1) * 7);
}

export function addWeeks(key: WeekKey, n: number): WeekKey {
  return weekKey(isoWeekOf(addDays(mondayOf(key), n * 7)));
}

export function compareWeeks(a: WeekKey, b: WeekKey): number {
  const pa = parseWeekKey(a);
  const pb = parseWeekKey(b);
  return pa.year - pb.year || pa.week - pb.week;
}

/** The ISO week that contains `instant`, in Amsterdam time. */
export function currentWeek(instant: Date): WeekKey {
  return weekKey(isoWeekOf(amsterdamDate(instant)));
}

/**
 * The week the user is planning for. On Sunday (Amsterdam time) this is the
 * upcoming week, otherwise the current one.
 */
export function planningWeek(instant: Date): WeekKey {
  const today = amsterdamDate(instant);
  const target = today.weekday === 7 ? addDays(today, 1) : today;
  return weekKey(isoWeekOf(target));
}

export function isSundayInAmsterdam(instant: Date): boolean {
  return amsterdamDate(instant).weekday === 7;
}

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** "23 – 29 nov" */
export function weekRangeLabel(key: WeekKey): string {
  const mon = mondayOf(key);
  const sun = addDays(mon, 6);
  const left = mon.month === sun.month ? `${mon.day}` : `${mon.day} ${MONTHS[mon.month - 1]}`;
  return `${left} – ${sun.day} ${MONTHS[sun.month - 1]}`;
}

export function weekNumberLabel(key: WeekKey): string {
  return `Week ${parseWeekKey(key).week}`;
}
