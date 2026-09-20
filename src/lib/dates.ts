import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

/**
 * Every timestamp is stored in UTC. Display always goes through these helpers
 * with an explicit IANA timezone so a user in Istanbul and one in Lagos see the
 * same instant rendered in their own local time.
 */
export function formatInTimezone(date: Date, timezone: string, pattern = 'd MMM yyyy, HH:mm'): string {
  try {
    return format(new TZDate(date, timezone), pattern);
  } catch {
    return format(date, pattern);
  }
}

/** Converts a wall-clock date+time in `timezone` into the UTC instant to store. */
export function zonedInputToUtc(dateInput: string, timeInput: string, timezone: string): Date {
  const [year, month, day] = dateInput.split('-').map(Number);
  const [hour, minute] = timeInput.split(':').map(Number);
  if (!year || !month || !day) throw new Error('Invalid date');

  const zoned = new TZDate(year, month - 1, day, hour ?? 0, minute ?? 0, 0, timezone);
  return new Date(zoned.getTime());
}

/** Splits a UTC instant back into the `date`/`time` inputs for a form. */
export function utcToZonedInput(date: Date, timezone: string): { date: string; time: string } {
  const zoned = new TZDate(date, timezone);
  return { date: format(zoned, 'yyyy-MM-dd'), time: format(zoned, 'HH:mm') };
}

export function greetingFor(now: Date, timezone: string): string {
  const hour = Number(formatInTimezone(now, timezone, 'H'));
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function relativeTime(date: Date, now = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];

  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(seconds) >= secondsInUnit) {
      return formatter.format(Math.round(seconds / secondsInUnit), unit);
    }
  }
  return formatter.format(seconds, 'second');
}

/** A stable list of common zones for the settings picker, user zone first. */
export function timezoneOptions(preferred?: string): string[] {
  const common = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Istanbul',
    'Africa/Lagos',
    'Africa/Nairobi',
    'Africa/Johannesburg',
    'Asia/Dubai',
    'Asia/Karachi',
    'Asia/Kolkata',
    'Asia/Jakarta',
    'Asia/Singapore',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Australia/Sydney',
  ];
  if (preferred && !common.includes(preferred)) return [preferred, ...common];
  return common;
}
