import { addDays, addMonths, format } from "date-fns";
import NepaliDate from "nepali-date-converter";

export type CalendarSystem = "gregorian" | "nepali";

const nepaliDateCache = new Map<string, NepaliDate>();

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNepaliDate(date: Date) {
  const key = toLocalDateKey(date);
  const cached = nepaliDateCache.get(key);
  if (cached) return cached;

  const value = new NepaliDate(date);
  nepaliDateCache.set(key, value);
  return value;
}

function toLocalStartOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function toCalendarMonthIndex(date: Date, calendarSystem: CalendarSystem) {
  if (calendarSystem === "nepali") {
    const bs = getNepaliDate(date).getBS();
    return bs.year * 12 + bs.month;
  }

  return date.getFullYear() * 12 + date.getMonth();
}

export function shiftCalendarMonth(
  date: Date,
  delta: number,
  calendarSystem: CalendarSystem,
) {
  if (calendarSystem === "nepali") {
    const bs = getNepaliDate(date).getBS();
    const target = new NepaliDate(bs.year, bs.month + delta, 1);
    return toLocalStartOfDay(target.toJsDate());
  }

  return addMonths(date, delta);
}

export function getCalendarMonthBounds(
  date: Date,
  calendarSystem: CalendarSystem,
) {
  if (calendarSystem === "nepali") {
    const bs = getNepaliDate(date).getBS();
    const monthStart = toLocalStartOfDay(
      new NepaliDate(bs.year, bs.month, 1).toJsDate(),
    );
    const nextMonthStart = toLocalStartOfDay(
      new NepaliDate(bs.year, bs.month + 1, 1).toJsDate(),
    );
    const monthEnd = addDays(nextMonthStart, -1);
    return { monthEnd, monthStart };
  }

  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { monthEnd, monthStart };
}

export function isCalendarMonthAfter(
  left: Date,
  right: Date,
  calendarSystem: CalendarSystem,
) {
  return (
    toCalendarMonthIndex(left, calendarSystem) >
    toCalendarMonthIndex(right, calendarSystem)
  );
}

export function formatCalendarDayNumber(
  date: Date,
  calendarSystem: CalendarSystem,
) {
  if (calendarSystem === "nepali") {
    return getNepaliDate(date).format("D");
  }
  return format(date, "d");
}

export function formatCalendarWeekday(
  date: Date,
  calendarSystem: CalendarSystem,
) {
  if (calendarSystem === "nepali") {
    return getNepaliDate(date).format("dd");
  }
  return format(date, "EEE");
}

export function formatCalendarMonthYear(
  date: Date,
  calendarSystem: CalendarSystem,
) {
  if (calendarSystem === "nepali") {
    return getNepaliDate(date).format("MMMM YYYY");
  }
  return format(date, "MMMM yyyy");
}

export function formatCalendarShortMonthYear(
  date: Date,
  calendarSystem: CalendarSystem,
) {
  if (calendarSystem === "nepali") {
    return getNepaliDate(date).format("MMM YYYY");
  }
  return format(date, "MMM yyyy");
}

export function formatCalendarDayTitle(
  date: Date,
  calendarSystem: CalendarSystem,
) {
  if (calendarSystem === "nepali") {
    return getNepaliDate(date).format("ddd, D MMMM YYYY");
  }
  return format(date, "EEE MMMM d, yyyy");
}

export function isSameCalendarMonth(
  left: Date,
  right: Date,
  calendarSystem: CalendarSystem,
) {
  if (calendarSystem === "nepali") {
    const leftBs = getNepaliDate(left).getBS();
    const rightBs = getNepaliDate(right).getBS();
    return leftBs.year === rightBs.year && leftBs.month === rightBs.month;
  }

  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}
