import { addDays, addMonths, addWeeks, format, isAfter, isBefore, isEqual, parseISO, startOfDay } from "date-fns";
import type { ISODate, RecurrenceRule } from "@/types/domain";

export function toIsoDay(date: Date): ISODate {
  return format(date, "yyyy-MM-dd");
}

export function fromIsoDay(day: ISODate): Date {
  return startOfDay(parseISO(`${day}T00:00:00`));
}

function matchesWeekday(date: Date, weekdays: number[] | undefined): boolean {
  if (!weekdays || weekdays.length === 0) return true;
  return weekdays.includes(date.getDay());
}

export function generateOccurrencesInRange(
  rule: RecurrenceRule,
  rangeStart: Date,
  rangeEnd: Date,
): ISODate[] {
  const start = fromIsoDay(rule.startDate);
  const safeStart = startOfDay(rangeStart);
  const safeEnd = startOfDay(rangeEnd);

  if (isAfter(start, safeEnd)) return [];

  const occurrences: ISODate[] = [];

  if (rule.freq === "day") {
    let cursor = start;
    while (isBefore(cursor, safeStart)) {
      cursor = addDays(cursor, rule.every);
    }
    while (!isAfter(cursor, safeEnd)) {
      occurrences.push(toIsoDay(cursor));
      cursor = addDays(cursor, rule.every);
    }
    return occurrences;
  }

  if (rule.freq === "week") {
    let cursor = start;
    while (isBefore(cursor, safeStart)) {
      cursor = addWeeks(cursor, rule.every);
    }

    while (!isAfter(cursor, safeEnd)) {
      for (let i = 0; i < 7; i += 1) {
        const day = addDays(cursor, i);
        if (isBefore(day, start)) continue;
        if (isBefore(day, safeStart) || isAfter(day, safeEnd)) continue;
        if (matchesWeekday(day, rule.weekdays)) {
          occurrences.push(toIsoDay(day));
        }
      }
      cursor = addWeeks(cursor, rule.every);
    }

    return Array.from(new Set(occurrences)).sort();
  }

  let cursor = start;
  while (isBefore(cursor, safeStart)) {
    cursor = addMonths(cursor, rule.every);
  }
  while (!isAfter(cursor, safeEnd)) {
    occurrences.push(toIsoDay(cursor));
    cursor = addMonths(cursor, rule.every);
  }

  return occurrences;
}

export function isOccurrenceDate(rule: RecurrenceRule, dateKey: ISODate): boolean {
  const date = fromIsoDay(dateKey);
  const occurrences = generateOccurrencesInRange(rule, date, date);
  return occurrences.some((entry) => isEqual(fromIsoDay(entry), date));
}
