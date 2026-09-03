const STORAGE_KEY = "boutq:storefront-oauth-return";
const MAX_AGE_MS = 10 * 60 * 1000;

type StorefrontOAuthReturn = {
  path: string;
  createdAt: number;
};

function isSafePath(path: unknown): path is string {
  if (
    typeof path !== "string" ||
    !/^\/[a-z0-9-]+\/auth-confirmed(?:\?.*)?$/i.test(path) ||
    path.includes("\\") ||
    path.startsWith("//")
  )
    return false;
  const slug = path.split("/")[1]?.toLowerCase();
  return Boolean(slug && !["admin", "auth", "api", "invoice"].includes(slug));
}

export function rememberStorefrontOAuthReturn(path: string) {
  if (typeof window === "undefined" || !isSafePath(path)) return;
  const value: StorefrontOAuthReturn = { path, createdAt: Date.now() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function readStorefrontOAuthReturn(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StorefrontOAuthReturn>;
    if (
      !isSafePath(value.path) ||
      typeof value.createdAt !== "number" ||
      Date.now() - value.createdAt > MAX_AGE_MS
    ) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return value.path;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearStorefrontOAuthReturn() {
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
}
