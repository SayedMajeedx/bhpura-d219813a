/**
 * How much room the launch checklist takes on the dashboard. A new store needs
 * it whole; a store that has done most of it (two steps of three, or all) sees
 * one line that opens it, so its sales come first: Pura, with seven orders and
 * two steps done, had a whole phone screen of checklist above its figures.
 */
export type ChecklistView = "full" | "line" | "hidden";

export function checklistView({
  completed,
  dismissed,
}: {
  completed: number;
  dismissed: boolean;
}): ChecklistView {
  if (dismissed) return "hidden";
  return completed >= 2 ? "line" : "full";
}
