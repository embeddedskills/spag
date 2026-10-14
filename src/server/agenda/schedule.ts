import type { agendaItems } from "~/server/db/schema";

type AgendaItem = Pick<
  typeof agendaItems.$inferSelect,
  | "id"
  | "type"
  | "isCompleted"
  | "targetDate"
  | "repeatInterval"
  | "scheduleMode"
  | "scheduleTimes"
  | "intervalMinutes"
  | "durationMode"
  | "durationDays"
  | "endDate"
>;

export function addMonthsPreservingDay(
  date: Date,
  monthCount: number,
  anchorDay = date.getDate(),
) {
  const nextDate = new Date(date);
  nextDate.setDate(1);
  nextDate.setMonth(nextDate.getMonth() + monthCount);
  const lastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
  nextDate.setDate(Math.min(anchorDay, lastDay));
  return nextDate;
}

export function getNextMonthlyOccurrence(start: Date, after: Date) {
  const monthDifference =
    (after.getFullYear() - start.getFullYear()) * 12 +
    after.getMonth() -
    start.getMonth();
  let monthOffset = Math.max(1, monthDifference);
  let next = addMonthsPreservingDay(start, monthOffset, start.getDate());

  if (next <= after) {
    monthOffset += 1;
    next = addMonthsPreservingDay(start, monthOffset, start.getDate());
  }

  return next;
}

function isWithinDuration(item: AgendaItem, date: Date) {
  if (item.durationMode === "untilDate" && item.endDate && date > item.endDate) return false;
  if (item.durationMode === "days" && item.durationDays) {
    const durationEnd = new Date(item.targetDate);
    durationEnd.setDate(durationEnd.getDate() + item.durationDays);
    if (date >= durationEnd) return false;
  }
  return true;
}

function getFixedTimes(item: AgendaItem) {
  return (item.scheduleTimes ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    .sort();
}

export function getOccurrenceDates(item: AgendaItem, from: Date, to: Date) {
  if (item.type === "note" || item.isCompleted) return [];

  const dates: Date[] = [];
  const add = (date: Date) => {
    if (date >= from && date < to && isWithinDuration(item, date)) dates.push(new Date(date));
  };

  if (item.scheduleMode === "fixedTimes") {
    const times = getFixedTimes(item);
    const cursor = new Date(Math.max(from.getTime(), new Date(item.targetDate).setHours(0, 0, 0, 0)));
    cursor.setHours(0, 0, 0, 0);
    while (cursor < to && dates.length < 400) {
      for (const time of times) {
        const [hours = 0, minutes = 0] = time.split(":").map(Number);
        const occurrence = new Date(cursor);
        occurrence.setHours(hours, minutes, 0, 0);
        if (occurrence >= item.targetDate) add(occurrence);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates.sort((a, b) => a.getTime() - b.getTime());
  }

  if (item.scheduleMode === "interval" && item.intervalMinutes) {
    const start = new Date(item.targetDate);
    const firstIndex = Math.max(0, Math.ceil((from.getTime() - start.getTime()) / (item.intervalMinutes * 60000)));
    for (let index = firstIndex; index < firstIndex + 400; index += 1) {
      const occurrence = new Date(start.getTime() + index * item.intervalMinutes * 60000);
      if (occurrence >= to) break;
      add(occurrence);
    }
    return dates;
  }

  const repeat = item.repeatInterval ?? "none";
  if (repeat === "none") {
    add(new Date(item.targetDate));
    return dates;
  }

  const start = new Date(item.targetDate);
  let occurrence = new Date(start);
  if (repeat === "monthly") {
    if (occurrence < from) {
      occurrence = getNextMonthlyOccurrence(start, new Date(from.getTime() - 1));
    }
  } else if (repeat === "daily" || repeat === "weekly") {
    const dayNumber = (date: Date) =>
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
    const intervalDays = repeat === "daily" ? 1 : 7;
    const dayDifference = Math.max(0, dayNumber(from) - dayNumber(start));
    const intervalOffset = Math.ceil(dayDifference / intervalDays);
    occurrence.setDate(start.getDate() + intervalOffset * intervalDays);
    while (occurrence < from) {
      occurrence.setDate(occurrence.getDate() + intervalDays);
    }
  }

  while (occurrence < to && dates.length < 400) {
    add(occurrence);
    if (repeat === "daily") occurrence.setDate(occurrence.getDate() + 1);
    else if (repeat === "weekly") occurrence.setDate(occurrence.getDate() + 7);
    else if (repeat === "monthly") {
      occurrence = addMonthsPreservingDay(
        start,
        (occurrence.getFullYear() - start.getFullYear()) * 12 +
          occurrence.getMonth() -
          start.getMonth() +
          1,
        start.getDate(),
      );
    } else break;
  }

  return dates;
}

export function parseScheduleTimes(value: string | null | undefined) {
  return (value ?? "").split(",").filter(Boolean);
}
