/**
 * How much room the launch checklist takes above the settings. A new store needs it open; a
 * store that has done at least half of it sees one line that opens it, so its settings come
 * first: on a phone, a store with four of seven steps done scrolled past a screen and a half of
 * checklist before the settings' tabs, on every visit and every tab. A choice the merchant made
 * (opening or folding it) is kept. The dashboard's checklist folds the same way
 * (`checklistView`).
 */
export function readinessFolded({
  completed,
  total,
  choice,
}: {
  completed: number;
  total: number;
  /** The merchant's own choice: true folded, false open, null none. */
  choice: boolean | null;
}): boolean {
  if (choice !== null) return choice;
  return total === 0 || completed * 2 >= total;
}

/**
 * Where the merchant's choice is kept. Versioned: the choice saved under the old rule (open until
 * every step was done) said nothing about the new one.
 */
export const readinessFoldKey = (brandId: string) => `store-readiness-folded-v2-${brandId}`;
