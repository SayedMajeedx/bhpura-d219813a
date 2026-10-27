// "Keep me logged in", by where the session is kept (the owner's review of 2026-10-27).
//
// The Supabase client keeps its session in `rememberingStorage`: the browser's lasting storage
// for a person who stays signed in (the default, as Shopify's and Google's sign-ins do), its
// session storage for one who unticked the box, which the browser itself empties when it closes.
// Nothing is ever signed out on load. Before, a choice was enforced by signing out on the next
// load whenever a tab had no marker: every new tab and every reopened app signed the person out,
// a shopper's sign-in never recorded the choice at all, and the sign-out ended the person's
// sessions on every device.

const CHOICE_KEY = "boutq.auth.remember"; // "no" when the person chose not to stay signed in
const RETIRED_KEYS = ["boutq.auth.rememberMe", "boutq.auth.tabAlive"];
// The Supabase client's own entries (the session, a sign-in's code verifier).
const isAuthEntry = (key: string) => key.startsWith("sb-");

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

function safely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

/** Whether this browser keeps the person signed in after it closes: yes unless they said no. */
export function remembersSession(local: Store | undefined = browserLocal()): boolean {
  return safely(() => local?.getItem(CHOICE_KEY) !== "no", true);
}

/**
 * The storage the Supabase client reads and writes its session through: the lasting one for a
 * remembered person, the session one otherwise. A read falls back to the other store, so a session
 * written just before the choice changed is still found.
 */
export function rememberingStorage(local: Store, session: Store) {
  const kept = () => (remembersSession(local) ? local : session);
  const other = () => (remembersSession(local) ? session : local);
  return {
    getItem: (key: string) =>
      safely(() => kept().getItem(key) ?? other().getItem(key), null as string | null),
    setItem: (key: string, value: string) =>
      safely(() => {
        kept().setItem(key, value);
        other().removeItem(key);
      }, undefined),
    removeItem: (key: string) =>
      safely(() => {
        local.removeItem(key);
        session.removeItem(key);
      }, undefined),
  };
}

/**
 * Records the choice and moves the session to where it belongs now: called at sign-in with the
 * box's value (every sign-in that offers no box stays signed in).
 */
export function applyRememberMe(
  remember: boolean,
  local: Store | undefined = browserLocal(),
  session: Store | undefined = browserSession(),
) {
  if (!local || !session) return;
  safely(() => {
    for (const key of RETIRED_KEYS) local.removeItem(key);
    if (remember) local.removeItem(CHOICE_KEY);
    else local.setItem(CHOICE_KEY, "no");
    const [from, to] = remember ? [session, local] : [local, session];
    const keys: string[] = [];
    for (let i = 0; i < from.length; i += 1) {
      const key = from.key(i);
      if (key && isAuthEntry(key)) keys.push(key);
    }
    for (const key of keys) {
      const value = from.getItem(key);
      if (value !== null) to.setItem(key, value);
      from.removeItem(key);
    }
  }, undefined);
}

function browserLocal(): Store | undefined {
  return typeof window === "undefined" ? undefined : safely(() => window.localStorage, undefined);
}

function browserSession(): Store | undefined {
  return typeof window === "undefined" ? undefined : safely(() => window.sessionStorage, undefined);
}
