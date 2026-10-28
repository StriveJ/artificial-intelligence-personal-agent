// day boundary
import { dayKey } from './time-boundary.mjs';

export function todayKey(tsLocal, dayStartHour = 6) {
  return dayKey(tsLocal, dayStartHour);
}

export function isNewDay(prevDay, today) {
  return Boolean(today) && prevDay !== today;
}

export function newDayMark(prevDay, today) {
  return isNewDay(prevDay, today) ? { from: prevDay || '', to: today } : null;
}

export function crossDayNotice(prevDay, today) {
  const mark = newDayMark(prevDay, today);
  if (!mark) return '';
  return `⏰ Day boundary: last active ${mark.from || "(no record)"} -> today ${mark.to}. Before starting, run aipa-day-check (consume the boundary marker) and aipa-day-start. In this turn, "today" means ${mark.to}.`;
}
