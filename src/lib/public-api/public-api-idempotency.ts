import { computeSha256Hex } from "./public-api-security";

export interface IdempotencyCheckResult {
  isCached: boolean;
  isConflict: boolean;
  status?: number;
  body?: any;
}

/**
 * Computes a deterministic hash of the request method, path, and stringified body
 */
export async function computeRequestPayloadHash(
  method: string,
  path: string,
  rawBody: string | null,
): Promise<string> {
  const content = `${method.toUpperCase()}:${path}:${rawBody || ""}`;
  return computeSha256Hex(content);
}

/**
 * Validates format of an Idempotency-Key header
 */
export function isValidIdempotencyKey(key: string | null): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  return trimmed.length >= 8 && trimmed.length <= 128;
}
