const SESSION_KEY_PREFIX = "boutq_cart_session_id:";

export function getExistingCartSessionId(brandId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(`${SESSION_KEY_PREFIX}${brandId}`);
  } catch {
    return null;
  }
}

export function getOrCreateCartSessionId(brandId: string): string {
  const existing = getExistingCartSessionId(brandId);
  if (existing) return existing;

  const sessionId = crypto.randomUUID();
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${SESSION_KEY_PREFIX}${brandId}`, sessionId);
    } catch {
      // Tracking must never block the shopping experience.
    }
  }
  return sessionId;
}

