import { formatInTimeZone } from "date-fns-tz";
import {
  differenceInCalendarDays,
  parseISO,
  addDays,
  format,
} from "date-fns";

export const APP_TIMEZONE =
  process.env.APP_TIMEZONE || "Asia/Kolkata";

export const TARGET_EXAM_DATE =
  process.env.TARGET_EXAM_DATE || "2027-02-07";

/**
 * "Today" as calculated server-side, in the app's configured timezone.
 * Returns yyyy-MM-dd string, safe to use as a stable calendar-date key.
 */
export function getTodayKey(): string {
  return formatInTimeZone(new Date(), APP_TIMEZONE, "yyyy-MM-dd");
}

export function getTodayDate(): Date {
  return parseISO(getTodayKey());
}

export function getTargetDate(): Date {
  const date = parseISO(TARGET_EXAM_DATE);

  if (Number.isNaN(date.getTime())) {
    return parseISO("2027-02-07");
  }

  return date;
}

/** Days remaining until the target exam date. Never negative. */
export function getDaysRemaining(): number {
  const todayKey = getTodayKey();

  const [todayYear, todayMonth, todayDay] = todayKey
    .split("-")
    .map(Number);

  const [targetYear, targetMonth, targetDay] = TARGET_EXAM_DATE
    .split("-")
    .map(Number);

  const todayUTC = Date.UTC(todayYear, todayMonth - 1, todayDay);
  const targetUTC = Date.UTC(targetYear, targetMonth - 1, targetDay);

  const diff = Math.round((targetUTC - todayUTC) / 86400000);

  return Number.isFinite(diff) ? Math.max(diff, 0) : 0;
}

export function isTargetReached(): boolean {
  return (
    getDaysRemaining() <= 0 &&
    differenceInCalendarDays(getTargetDate(), getTodayDate()) < 0
  );
}

/**
 * All calendar dates from today through the target date (inclusive),
 * as yyyy-MM-dd strings.
 */
export function getDateRangeToTarget(): string[] {
  const today = getTodayDate();
  const target = getTargetDate();
  const totalDays = Math.max(
    differenceInCalendarDays(target, today),
    0
  );

  const dates: string[] = [];

  for (let i = 0; i <= totalDays; i++) {
    dates.push(format(addDays(today, i), "yyyy-MM-dd"));
  }

  return dates;
}

export function dateKeyToDate(dateKey: string): Date {
  return parseISO(dateKey);
}

export function formatDisplayDate(dateKey: string): string {
  const date = parseISO(dateKey);

  // Prevent the dashboard from crashing if an invalid date is received.
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return format(date, "MMMM d, yyyy");
}
