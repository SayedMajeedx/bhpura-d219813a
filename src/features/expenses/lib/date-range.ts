import type { DatePreset } from "@/features/expenses/types";

export function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The days a preset covers, on the reader's own calendar (a week runs Monday to Sunday). */
export function presetRange(preset: Exclude<DatePreset, "custom">, now = new Date()) {
  if (preset === "today") {
    const today = localDateKey(now);
    return { from: today, to: today };
  }
  if (preset === "week") {
    const monday = new Date(now);
    const weekday = monday.getDay() || 7;
    monday.setDate(monday.getDate() - weekday + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: localDateKey(monday), to: localDateKey(sunday) };
  }
  return {
    from: localDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}
