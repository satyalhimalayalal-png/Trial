import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import type { ISODate } from "@/types/domain";

export const DAY_KEY_FORMAT = "yyyy-MM-dd";

export function toDayKey(date: Date): ISODate {
  return format(date, DAY_KEY_FORMAT);
}

export function fromDayKey(dayKey: ISODate): Date {
  return new Date(`${dayKey}T00:00:00`);
}

export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

export function shiftWeek(weekStart: Date, amount: number): Date {
  return addWeeks(weekStart, amount);
}

export function getWeekDayKeys(weekStart: Date): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => toDayKey(addDays(weekStart, i)));
}
