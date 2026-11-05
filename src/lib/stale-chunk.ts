/**
 * A page left open across a release (the installed admin stays open for days) still asks for the
 * old build's files when it opens another page, and a release removes them: the page's code
 * cannot load, and it showed "Something went wrong". Such a page reloads itself once, onto the new
 * build (the PWA review of 2026-11-05). At most once a minute, so a file that is really missing
 * shows the error instead of reloading for ever.
 */

const KEY = "boutq:stale-build-reload";
const AT_MOST_EVERY_MS = 60_000;

const STALE_FILE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading (CSS )?chunk [\w-]+ failed/i;

/** The error says a file of the page's own build could not be loaded. */
export function isStaleBuildError(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: unknown }).name;
  if (name === "ChunkLoadError") return true;
  const message =
    typeof error === "string" ? error : String((error as { message?: unknown }).message ?? "");
  return STALE_FILE.test(message);
}

/** Whether to reload now, given when this tab last reloaded for it. */
export function shouldReloadForNewBuild(now: number, lastReloadAt: number | null): boolean {
  return lastReloadAt === null || now - lastReloadAt >= AT_MOST_EVERY_MS;
}

/** Reloads onto the new build once; answers whether it did. */
export function reloadForNewBuild(now = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  let last: number | null = null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    last = raw ? Number(raw) || null : null;
  } catch {
    // No storage: reload anyway, once per page (the flag below).
  }
  if (!shouldReloadForNewBuild(now, last) || reloading) return false;
  reloading = true;
  try {
    window.sessionStorage.setItem(KEY, String(now));
  } catch {
    // Nothing kept.
  }
  window.location.reload();
  return true;
}

let reloading = false;

/** Listens for the bundler's own sign of a file that cannot load (`vite:preloadError`). */
export function installStaleBuildReload(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onPreloadError = (event: Event) => {
    if (reloadForNewBuild()) event.preventDefault();
  };
  window.addEventListener("vite:preloadError", onPreloadError);
  return () => window.removeEventListener("vite:preloadError", onPreloadError);
}
