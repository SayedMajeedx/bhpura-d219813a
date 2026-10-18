/**
 * When the signed-in person's profile is read again. Supabase reports `SIGNED_IN` each time the
 * page becomes visible and `TOKEN_REFRESHED` every hour, and the profile was read on each: two
 * requests to the database (the user, then the profile) every time the merchant came back to
 * the app, and a new profile object that redrew every screen reading it. It was also read twice
 * on start (the first load and `INITIAL_SESSION`). Now an event for the person already loaded
 * changes nothing, except `USER_UPDATED` (their email or details changed).
 */
export type ProfileAuthAction = "clear" | "keep" | "load";

export function profileAuthAction(
  event: string,
  sessionUserId: string | null | undefined,
  knownUserId: string | null,
): ProfileAuthAction {
  if (event === "SIGNED_OUT" || !sessionUserId) return "clear";
  if (sessionUserId !== knownUserId) return "load";
  return event === "USER_UPDATED" ? "load" : "keep";
}

/** The profile already held when a new read says the same, so its readers do not redraw. */
export function keepIfSame<T>(held: T | null, read: T | null): T | null {
  if (held === read) return held;
  if (held === null || read === null) return read;
  return JSON.stringify(held) === JSON.stringify(read) ? held : read;
}
