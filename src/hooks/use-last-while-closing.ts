import { useEffect, useState } from "react";

/**
 * The value a dialog shows, kept while it closes. A dialog that draws what is open (a form, the
 * sale being reversed) and is closed by clearing that value empties at once, so its fading box
 * shrinks to a bare frame: the partner shops' dialogs closed with a flash. With this the last
 * value stays on screen until the dialog has gone, and the next opening shows its own at once.
 */
export function useLastWhileClosing<T>(value: T | null | undefined): T | null {
  const [last, setLast] = useState<T | null>(value ?? null);
  useEffect(() => {
    if (value != null) setLast(value);
  }, [value]);
  return value ?? last;
}
