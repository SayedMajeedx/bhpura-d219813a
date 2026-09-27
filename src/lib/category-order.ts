/**
 * The category ids in their order after moving one up (-1) or down (+1) a
 * place; null when it cannot move (not found, or already first / last).
 */
export function moveCategory(ids: readonly string[], id: string, dir: -1 | 1): string[] | null {
  const index = ids.indexOf(id);
  const target = index + dir;
  if (index === -1 || target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
