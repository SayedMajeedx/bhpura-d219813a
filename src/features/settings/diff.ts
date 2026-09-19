/**
 * Deep equality check between two arbitrary values (primitives, arrays, objects).
 */
export function isEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }

  if (typeof a !== typeof b) return false;

  if (typeof a !== "object") return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!isEqual(a[key], b[key])) return false;
  }

  return true;
}

/**
 * Computes the shallow/jsonb diff of `current` against `initial`.
 * Returns a new object containing only keys whose values differ from `initial`.
 */
export function diffObjects<T extends Record<string, any>>(
  initial: T | null | undefined,
  current: T | null | undefined
): Partial<T> {
  const diff: Partial<T> = {};
  if (!current) return diff;
  if (!initial) return { ...current };

  for (const key of Object.keys(current) as (keyof T)[]) {
    const initVal = initial[key];
    const currVal = current[key];

    if (!isEqual(initVal, currVal)) {
      diff[key] = currVal;
    }
  }

  return diff;
}
