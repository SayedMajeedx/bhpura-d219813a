import { useState } from "react";

/**
 * Counts a dialog's openings. A form keyed by the count starts blank each time it opens and keeps
 * what was typed while the dialog fades out (a form mounted only while open emptied at once).
 */
export function useOpenSession(open: boolean): number {
  const [session, setSession] = useState(open ? 1 : 0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((count) => count + 1);
  }
  return session;
}
