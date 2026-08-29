import { describe, it, expect } from "vitest";
import {
  computeSha256Hex,
  generateBrandApiKeySecret,
  generateWebhookSecret,
  computeWebhookHmacSignature,
  verifyWebhookHmacSignature,
  hasRequiredScope,
  checkRateLimit,
} from "../src/lib/public-api/public-api-security";
import {
  computeRequestPayloadHash,
  isValidIdempotencyKey,
} from "../src/lib/public-api/public-api-idempotency";
import {
  transformRecordWithMapping,
  AVAILABLE_CONNECTORS,
} from "../src/lib/connectors/connector-framework";

describe("Public API Security & Cryptography", () => {
  it("computes deterministic SHA-256 hex hashes", async () => {
    const text = "bq_live_secret_sample_test_123";
    const hash1 = await computeSha256Hex(text);
    const hash2 = await computeSha256Hex(text);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 output is 64 hex chars
  });

  it("generates brand API key pairs with proper prefixes, hints, and hashes", async () => {
    const liveKey = await generateBrandApiKeySecret("live");
    expect(liveKey.rawSecret.startsWith("bq_live_")).toBe(true);
    expect(liveKey.keyPrefix).toBe("bq_live_");
    expect(liveKey.keyHint).toBe(liveKey.rawSecret.slice(-4));
    expect(liveKey.keyHash).toHaveLength(64);

    const testKey = await generateBrandApiKeySecret("test");
    expect(testKey.rawSecret.startsWith("bq_test_")).toBe(true);
    expect(testKey.keyPrefix).toBe("bq_test_");
  });

  it("generates webhook secrets starting with whsec_", () => {
    const secret = generateWebhookSecret();
    expect(secret.startsWith("whsec_")).toBe(true);
    expect(secret.length).toBeGreaterThan(20);
  });
});

describe("RBAC Scope Authorization", () => {
  it("accurately checks exact scopes", () => {
    const scopes = ["products:read", "orders:read", "inventory:read"];
    expect(hasRequiredScope(scopes, "products:read")).toBe(true);
    expect(hasRequiredScope(scopes, "orders:read")).toBe(true);
    expect(hasRequiredScope(scopes, "orders:write")).toBe(false);
    expect(hasRequiredScope(scopes, "customers:read")).toBe(false);
  });

  it("handles wildcard scopes properly", () => {
    const wildcardScopes = ["products:*", "loyalty:*"];
    expect(hasRequiredScope(wildcardScopes, "products:read")).toBe(true);
    expect(hasRequiredScope(wildcardScopes, "products:write")).toBe(true);
    expect(hasRequiredScope(wildcardScopes, "loyalty:read")).toBe(true);
    expect(hasRequiredScope(wildcardScopes, "loyalty:write")).toBe(true);
    expect(hasRequiredScope(wildcardScopes, "orders:read")).toBe(false);
  });

  it("handles master admin wildcard (*)", () => {
    const adminScopes = ["*"];
    expect(hasRequiredScope(adminScopes, "products:read")).toBe(true);
    expect(hasRequiredScope(adminScopes, "orders:write")).toBe(true);
    expect(hasRequiredScope(adminScopes, "loyalty:write")).toBe(true);
  });
});

describe("In-Memory Sliding Window Rate Limiter", () => {
  it("allows requests under the quota and tracks remaining tokens", () => {
    const keyId = `test_key_${Date.now()}`;
    const firstCheck = checkRateLimit(keyId, 10);

    expect(firstCheck.allowed).toBe(true);
    expect(firstCheck.remaining).toBeLessThanOrEqual(10);
    expect(firstCheck.resetSeconds).toBeGreaterThan(0);
  });

  it("rejects traffic when quota is exhausted", () => {
    const keyId = `exhaust_key_${Date.now()}`;
    // Exhaust 3 tokens
    checkRateLimit(keyId, 3);
    checkRateLimit(keyId, 3);
    checkRateLimit(keyId, 3);

    const blockedCheck = checkRateLimit(keyId, 3);
    expect(blockedCheck.allowed).toBe(false);
    expect(blockedCheck.remaining).toBe(0);
  });
});

describe("Idempotency Engine & Request Hashing", () => {
  it("validates idempotency key format", () => {
    expect(isValidIdempotencyKey("valid-uuid-12345678")).toBe(true);
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey(null)).toBe(false);
    expect(isValidIdempotencyKey("")).toBe(false);
  });

  it("produces deterministic request payload hashes", async () => {
    const method = "POST";
    const path = "/api/v1/orders";
    const body = JSON.stringify({ item: "A", quantity: 2 });

    const hash1 = await computeRequestPayloadHash(method, path, body);
    const hash2 = await computeRequestPayloadHash(method, path, body);
    expect(hash1).toBe(hash2);

    const differentBody = JSON.stringify({ item: "A", quantity: 3 });
    const hash3 = await computeRequestPayloadHash(method, path, differentBody);
    expect(hash1).not.toBe(hash3);
  });
});

describe("HMAC-SHA256 Webhook Signatures & Replay Prevention", () => {
  const secret = "whsec_super_secret_signing_key_456";
  const payload = JSON.stringify({ event: "order.created", order_id: "ord_999" });

  it("generates and verifies valid HMAC webhook signatures", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const header = await computeWebhookHmacSignature(secret, timestamp, payload);

    expect(header).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);

    const verification = await verifyWebhookHmacSignature(secret, header, payload);
    expect(verification.isValid).toBe(true);
  });

  it("rejects tampered webhook payloads", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const header = await computeWebhookHmacSignature(secret, timestamp, payload);

    const tamperedPayload = JSON.stringify({ event: "order.created", order_id: "ord_1000_TAMPERED" });
    const verification = await verifyWebhookHmacSignature(secret, header, tamperedPayload);
    expect(verification.isValid).toBe(false);
  });

  it("rejects replayed webhook requests older than tolerance window", async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const header = await computeWebhookHmacSignature(secret, oldTimestamp, payload);

    const verification = await verifyWebhookHmacSignature(secret, header, payload, 300); // 5 min tolerance
    expect(verification.isValid).toBe(false);
    expect(verification.error).toContain("expired");
  });
});

describe("Connector Framework & Field Mappings", () => {
  it("transforms nested objects according to field mapping rules", () => {
    const sourceData = {
      title: "Luxury Abaya Collection",
      variants: [
        {
          price: 45.5,
          sku: "ABY-001",
          inventory_quantity: 18,
        },
      ],
    };

    const mappingRules = {
      product_name: "title",
      unit_price: "variants.0.price",
      stock_sku: "variants.0.sku",
      stock_qty: "variants.0.inventory_quantity",
    };

    const mapped = transformRecordWithMapping(sourceData, mappingRules);

    expect(mapped).toEqual({
      product_name: "Luxury Abaya Collection",
      unit_price: 45.5,
      stock_sku: "ABY-001",
      stock_qty: 18,
    });
  });

  it("includes all core connector presets with valid configurations", () => {
    const types = AVAILABLE_CONNECTORS.map((c) => c.type);
    expect(types).toContain("shopify");
    expect(types).toContain("salla");
    expect(types).toContain("zid");
    expect(types).toContain("woocommerce");
    expect(types).toContain("zapier");
    expect(types).toContain("custom_accounting");
    expect(types).toContain("custom_pos");
  });
});
