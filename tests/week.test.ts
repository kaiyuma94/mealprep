import { describe, expect, it } from 'vitest';
import { addWeeks, amsterdamDate, compareWeeks, currentWeek, isoWeekOf, mondayOf, planningWeek, weekRangeLabel } from '../src/lib/week';

describe('ISO week calculation', () => {
  it.each([
    [{ year: 2026, month: 1, day: 1 }, '2026-W01'], // Thursday
    [{ year: 2027, month: 1, day: 1 }, '2026-W53'], // Friday belongs to the previous ISO year
    [{ year: 2024, month: 12, day: 30 }, '2025-W01'], // Monday of week 1 in the next year
    [{ year: 2021, month: 1, day: 3 }, '2020-W53'], // Sunday
    [{ year: 2026, month: 11, day: 22 }, '2026-W47'], // Sunday
    [{ year: 2026, month: 11, day: 23 }, '2026-W48'], // Monday
  ])('%o → %s', (date, key) => {
    const w = isoWeekOf(date);
    expect(`${w.year}-W${String(w.week).padStart(2, '0')}`).toBe(key);
  });

  it('round-trips Monday and handles year rollover', () => {
    expect(mondayOf('2026-W48')).toEqual({ year: 2026, month: 11, day: 23 });
    expect(addWeeks('2026-W52', 1)).toBe('2026-W53');
    expect(addWeeks('2026-W53', 1)).toBe('2027-W01');
    expect(addWeeks('2027-W01', -2)).toBe('2026-W52');
    expect(compareWeeks('2026-W53', '2027-W01')).toBeLessThan(0);
    expect(weekRangeLabel('2026-W48')).toBe('23 – 29 nov');
  });
});

describe('Sunday boundaries in Europe/Amsterdam', () => {
  it('shows the upcoming week on Sunday', () => {
    // Sunday 22 Nov 2026, 10:00 Amsterdam (CET = UTC+1)
    const sunday = new Date('2026-11-22T09:00:00Z');
    expect(currentWeek(sunday)).toBe('2026-W47');
    expect(planningWeek(sunday)).toBe('2026-W48');
  });

  it('uses Amsterdam time, not UTC, around midnight', () => {
    // Saturday 23:30 UTC is already Sunday 00:30 in Amsterdam.
    const lateSaturdayUtc = new Date('2026-11-21T23:30:00Z');
    expect(amsterdamDate(lateSaturdayUtc).weekday).toBe(7);
    expect(planningWeek(lateSaturdayUtc)).toBe('2026-W48');
    // Sunday 23:30 UTC is Monday 00:30 in Amsterdam: current = planning.
    const lateSundayUtc = new Date('2026-11-22T23:30:00Z');
    expect(amsterdamDate(lateSundayUtc).weekday).toBe(1);
    expect(planningWeek(lateSundayUtc)).toBe('2026-W48');
    expect(currentWeek(lateSundayUtc)).toBe('2026-W48');
  });

  it('handles summer time (CEST = UTC+2)', () => {
    // Saturday 22:30 UTC on 27 June 2026 = Sunday 00:30 CEST
    const d = new Date('2026-06-27T22:30:00Z');
    expect(amsterdamDate(d).weekday).toBe(7);
    expect(planningWeek(d)).toBe(addWeeks(currentWeek(d), 1));
  });

  it('a weekday plans the current week', () => {
    const wednesday = new Date('2026-11-25T12:00:00Z');
    expect(planningWeek(wednesday)).toBe('2026-W48');
  });

  it('Sunday planning week rolls over the ISO year', () => {
    // Sunday 3 Jan 2027 is in 2026-W53; next week is 2027-W01.
    const d = new Date('2027-01-03T12:00:00Z');
    expect(currentWeek(d)).toBe('2026-W53');
    expect(planningWeek(d)).toBe('2027-W01');
  });
});
