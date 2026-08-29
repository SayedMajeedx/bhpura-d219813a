import type { ApiScope } from "./public-api.types";

/**
 * Computes a SHA-256 hex string from raw input string using Web Crypto (SubtleCrypto)
 */
export async function computeSha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generates a brand-new API key pair:
 * - rawSecret: string presented once to the user e.g. "bq_live_9f8a..."
 * - keyHash: SHA-256 hex string stored in DB
 * - keyHint: Last 4 chars e.g. "98ab"
 * - keyPrefix: "bq_live_" or "bq_test_"
 */
export async function generateBrandApiKeySecret(environment: "live" | "test" = "live"): Promise<{
  rawSecret: string;
  keyHash: string;
  keyHint: string;
  keyPrefix: string;
}> {
  const prefix = environment === "live" ? "bq_live_" : "bq_test_";
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  
  const rawSecret = `${prefix}${randomHex}`;
  const keyHash = await computeSha256Hex(rawSecret);
  const keyHint = rawSecret.slice(-4);

  return {
    rawSecret,
    keyHash,
    keyHint,
    keyPrefix: prefix,
  };
}

/**
 * Generates a webhook secret e.g. "whsec_..."
 */
export function generateWebhookSecret(): string {
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `whsec_${randomHex}`;
}

/**
 * Computes an HMAC-SHA256 signature for webhook payload
 * Format: "t={timestamp},v1={hex_signature}"
 */
export async function computeWebhookHmacSignature(
  secret: string,
  timestamp: number,
  payload: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(`${timestamp}.${payload}`);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `t=${timestamp},v1=${signatureHex}`;
}

/**
 * Verifies HMAC-SHA256 webhook signature with replay protection (5 minutes tolerance)
 */
export async function verifyWebhookHmacSignature(
  secret: string,
  headerValue: string,
  rawPayload: string,
  toleranceSeconds: number = 300,
): Promise<{ isValid: boolean; error?: string }> {
  if (!headerValue || !headerValue.includes("t=") || !headerValue.includes("v1=")) {
    return { isValid: false, error: "Invalid signature header format. Expected 't=...,v1=...'" };
  }

  const parts = headerValue.split(",");
  let timestampStr: string | null = null;
  let signatureHex: string | null = null;

  for (const part of parts) {
    const [k, v] = part.trim().split("=");
    if (k === "t") timestampStr = v;
    if (k === "v1") signatureHex = v;
  }

  if (!timestampStr || !signatureHex) {
    return { isValid: false, error: "Missing timestamp or v1 signature component" };
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return { isValid: false, error: "Invalid timestamp integer" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return { isValid: false, error: "Webhook timestamp expired (replay attack prevention)" };
  }

  const expectedSignatureHeader = await computeWebhookHmacSignature(secret, timestamp, rawPayload);
  const expectedSigHex = expectedSignatureHeader.split("v1=")[1];

  // Constant-time string comparison
  const encoder = new TextEncoder();
  const a = encoder.encode(signatureHex);
  const b = encoder.encode(expectedSigHex);

  if (a.length !== b.length) {
    return { isValid: false, error: "Signature mismatch" };
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a[i] ^ b[i];
  }

  if (mismatch !== 0) {
    return { isValid: false, error: "Signature verification failed" };
  }

  return { isValid: true };
}

/**
 * Checks whether an array of granted scopes satisfies a required scope
 */
export function hasRequiredScope(grantedScopes: string[], requiredScope: ApiScope): boolean {
  if (grantedScopes.includes("*") || grantedScopes.includes("admin")) return true;
  if (grantedScopes.includes(requiredScope)) return true;

  // Wildcard scope check e.g. "products:*" satisfies "products:read" and "products:write"
  const [resource] = requiredScope.split(":");
  if (grantedScopes.includes(`${resource}:*`)) return true;

  return false;
}

// In-Memory Rate Limiter sliding window for high performance
interface RateLimitBucket {
  tokens: number;
  lastRefillMs: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();

/**
 * Evaluates whether a request from a given API key ID exceeds rate limit
 */
export function checkRateLimit(
  keyId: string,
  limitPerMinute: number = 120,
): { allowed: boolean; remaining: number; resetSeconds: number } {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(keyId) || { tokens: limitPerMinute, lastRefillMs: now };

  // Calculate tokens to add based on elapsed time
  const elapsedMs = now - bucket.lastRefillMs;
  const tokensToAdd = (elapsedMs / 60000) * limitPerMinute;
  bucket.tokens = Math.min(limitPerMinute, bucket.tokens + tokensToAdd);
  bucket.lastRefillMs = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    rateLimitBuckets.set(keyId, bucket);
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      resetSeconds: Math.ceil((60000 - (now % 60000)) / 1000),
    };
  } else {
    rateLimitBuckets.set(keyId, bucket);
    return {
      allowed: false,
      remaining: 0,
      resetSeconds: Math.ceil(((1 - bucket.tokens) / limitPerMinute) * 60),
    };
  }
}
