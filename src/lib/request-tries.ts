import { getRequest } from "@tanstack/react-start/server";

/**
 * A few tries an hour from one address, for a public server function where a stranger could
 * guess (an order's number and phone, a gift card's code). Kept in the worker's memory: a
 * determined guesser spread over many workers still meets the guess's own odds.
 */
const WINDOW_MS = 60 * 60 * 1000;
const tries = new Map<string, number[]>();

export function allowTry(key: string, now: number, perHour = 10): boolean {
  const recent = (tries.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= perHour) {
    tries.set(key, recent);
    return false;
  }
  recent.push(now);
  tries.set(key, recent);
  if (tries.size > 10_000) tries.clear();
  return true;
}

export function clientIp(): string {
  try {
    const request = getRequest();
    return (
      request?.headers.get("cf-connecting-ip") ||
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}
