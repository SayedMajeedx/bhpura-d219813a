import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  computeSha256Hex,
  hasRequiredScope,
  checkRateLimit,
} from "./public-api-security";
import {
  computeRequestPayloadHash,
  isValidIdempotencyKey,
} from "./public-api-idempotency";
import { dispatchBrandWebhookEvent } from "../webhooks/webhook-dispatcher.server";
import {
  hasFeature,
  checkEntitlement,
  consumeBrandUsage,
} from "../saas-billing/entitlements-engine.server";
import type { ApiScope } from "./public-api.types";

const db = supabaseAdmin as any;

interface AuthKeyContext {
  apiKeyId: string;
  brandId: string;
  brandSlug: string;
  brandName: string;
  scopes: string[];
  rateLimitPerMinute: number;
}

function jsonResponse(
  data: any,
  status = 200,
  extraHeaders: Record<string, string> = {},
  requestId?: string,
): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  if (requestId) headers.set("X-Request-ID", requestId);

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

function errorResponse(
  code: string,
  message: string,
  status = 400,
  details?: any,
  requestId?: string,
  rateLimitHeaders: Record<string, string> = {},
): Response {
  return jsonResponse(
    {
      success: false,
      error: {
        code,
        message,
        details: details ?? null,
        request_id: requestId || "unknown",
      },
    },
    status,
    rateLimitHeaders,
    requestId,
  );
}

/**
 * Main HTTP router for /api/v1/* requests
 */
export async function handlePublicApiV1Request(
  request: Request,
  env: Cloudflare.Env,
  ctx?: ExecutionContext,
): Promise<Response> {
  const startTime = Date.now();
  const requestId =
    request.headers.get("X-Request-ID") ||
    `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, ""); // trim trailing slash
  const method = request.method.toUpperCase();

  // 1. Root /api/v1 Discovery Endpoint
  if (path === "/api/v1" || path === "/api/v1/health") {
    return jsonResponse(
      {
        success: true,
        service: "Boutq OS Public API",
        version: "v1",
        documentation: "https://boutq.store/docs/api/v1",
        timestamp: new Date().toISOString(),
      },
      200,
      {},
      requestId,
    );
  }

  // 2. Extract and Authenticate API Key
  const authHeader = request.headers.get("Authorization") || "";
  const apiKeyHeader = request.headers.get("X-API-Key") || "";
  let rawToken = "";

  if (authHeader.startsWith("Bearer ")) {
    rawToken = authHeader.substring(7).trim();
  } else if (apiKeyHeader) {
    rawToken = apiKeyHeader.trim();
  }

  if (!rawToken) {
    return errorResponse(
      "unauthorized",
      "Missing API key. Provide Bearer token or X-API-Key header.",
      401,
      null,
      requestId,
    );
  }

  const keyHash = await computeSha256Hex(rawToken);

  // Validate key in Supabase
  const { data: keyValidation, error: keyErr } = await db.rpc(
    "rpc_validate_api_key_hash",
    { p_key_hash: keyHash },
  );

  const authRow = keyValidation?.[0];
  if (keyErr || !authRow || !authRow.is_valid) {
    const reason = authRow?.error_reason || "invalid_credentials";
    const statusMsg =
      reason === "expired_key"
        ? "API key has expired"
        : reason === "revoked_key"
          ? "API key has been revoked"
          : "Invalid or unrecognized API key";

    return errorResponse("unauthorized", statusMsg, 401, null, requestId);
  }

  const authContext: AuthKeyContext = {
    apiKeyId: authRow.api_key_id,
    brandId: authRow.brand_id,
    brandSlug: authRow.brand_slug,
    brandName: authRow.brand_name,
    scopes: authRow.scopes || [],
    rateLimitPerMinute: authRow.rate_limit_per_minute || 120,
  };

  // Helper for scope authorization
  const requireScope = (scope: ApiScope): boolean => {
    return hasRequiredScope(authContext.scopes, scope);
  };

  // 3. SaaS Plan Entitlement Verification
  const isApiFeatureEnabled = await hasFeature(db, authContext.brandId, "api.enabled");
  if (!isApiFeatureEnabled) {
    return errorResponse(
      "forbidden_plan_entitlement",
      "Public REST API access is not enabled on your brand's subscription plan. Please upgrade to a Pro or Enterprise plan.",
      403,
      { required_feature: "api.enabled" },
      requestId,
    );
  }

  // 4. Sliding Window Rate Limiting (Per-Minute)
  const rateLimitResult = checkRateLimit(
    authContext.apiKeyId,
    authContext.rateLimitPerMinute,
  );

  const rateLimitHeaders: Record<string, string> = {
    "X-RateLimit-Limit": authContext.rateLimitPerMinute.toString(),
    "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
    "X-RateLimit-Reset": rateLimitResult.resetSeconds.toString(),
  };

  if (!rateLimitResult.allowed) {
    return errorResponse(
      "rate_limit_exceeded",
      `Rate limit of ${authContext.rateLimitPerMinute} requests/minute exceeded. Try again in ${rateLimitResult.resetSeconds}s.`,
      429,
      { retry_after_seconds: rateLimitResult.resetSeconds },
      requestId,
      {
        ...rateLimitHeaders,
        "Retry-After": rateLimitResult.resetSeconds.toString(),
      },
    );
  }

  // 5. Monthly Usage Metering & Quotas
  const entCheck = await checkEntitlement(db, authContext.brandId, "api.monthly_requests", 1);
  if (!entCheck.allowed) {
    return errorResponse(
      "monthly_quota_exceeded",
      `Monthly API request limit of ${entCheck.limit_value} requests has been exceeded for your current billing cycle.`,
      429,
      {
        metric: "api.monthly_requests",
        current_usage: entCheck.current_usage,
        limit: entCheck.limit_value,
      },
      requestId,
      rateLimitHeaders,
    );
  }

  // Consume 1 request in the meter asynchronously
  void consumeBrandUsage(
    db,
    authContext.brandId,
    "api.monthly_requests",
    1,
    `req_${requestId}`,
    {
      path,
      method,
      request_id: requestId,
      api_key_id: authContext.apiKeyId,
    },
  );

  // 4. Parse Request Body with 2MB limit
  let rawBodyText = "";
  let parsedBody: any = null;

  if (["POST", "PUT", "PATCH"].includes(method)) {
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > 2 * 1024 * 1024) {
      return errorResponse(
        "payload_too_large",
        "Request payload exceeds 2MB limit.",
        413,
        null,
        requestId,
        rateLimitHeaders,
      );
    }

    try {
      rawBodyText = await request.text();
      if (rawBodyText) {
        parsedBody = JSON.parse(rawBodyText);
      }
    } catch {
      return errorResponse(
        "invalid_json",
        "Malformed JSON payload in request body.",
        400,
        null,
        requestId,
        rateLimitHeaders,
      );
    }
  }

  // 5. Idempotency Key Handling for mutating requests
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (idempotencyKey && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    if (!isValidIdempotencyKey(idempotencyKey)) {
      return errorResponse(
        "invalid_idempotency_key",
        "Idempotency-Key must be 8-128 alphanumeric characters or hyphens/underscores.",
        400,
        null,
        requestId,
        rateLimitHeaders,
      );
    }

    const requestHash = await computeRequestPayloadHash(method, path, rawBodyText);
    const { data: idemResult } = await db.rpc(
      "rpc_get_or_create_idempotency_record",
      {
        p_brand_id: authContext.brandId,
        p_idempotency_key: idempotencyKey,
        p_resource_path: path,
        p_request_hash: requestHash,
        p_status_code: null,
        p_response_body: null,
      },
    );

    const record = idemResult?.[0];
    if (record && !record.is_new) {
      if (record.is_mismatch) {
        return errorResponse(
          "idempotency_conflict",
          "Idempotency key was previously used with a different request payload or method.",
          409,
          null,
          requestId,
          rateLimitHeaders,
        );
      }
      if (record.is_in_flight) {
        return errorResponse(
          "request_in_flight",
          "A concurrent request with the same idempotency key is currently processing.",
          409,
          null,
          requestId,
          rateLimitHeaders,
        );
      }
      if (record.status_code && record.response_body) {
        // Return cached response
        return jsonResponse(
          record.response_body,
          record.status_code,
          { ...rateLimitHeaders, "X-Idempotent-Replay": "true" },
          requestId,
        );
      }
    }
  }

  // Helper to record idempotency completion & audit log
  const finalizeResponse = async (status: number, responseData: any): Promise<Response> => {
    if (idempotencyKey && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const requestHash = await computeRequestPayloadHash(method, path, rawBodyText);
      await db.rpc("rpc_get_or_create_idempotency_record", {
        p_brand_id: authContext.brandId,
        p_idempotency_key: idempotencyKey,
        p_resource_path: path,
        p_request_hash: requestHash,
        p_status_code: status,
        p_response_body: responseData,
      });
    }

    // Fire background audit log record asynchronously
    const durationMs = Date.now() - startTime;
    const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || null;
    const userAgent = request.headers.get("User-Agent") || null;

    void Promise.resolve(
      db.rpc("rpc_record_api_request_log", {
        p_brand_id: authContext.brandId,
        p_api_key_id: authContext.apiKeyId,
        p_request_id: requestId,
        p_idempotency_key: idempotencyKey,
        p_method: method,
        p_path: path,
        p_status_code: status,
        p_ip_address: clientIp,
        p_user_agent: userAgent,
        p_duration_ms: durationMs,
      })
    ).catch(() => {});

    return jsonResponse(responseData, status, rateLimitHeaders, requestId);
  };

  try {
    // ========================================================================
    // RESOURCE: PRODUCTS & CATALOG
    // ========================================================================
    if (path === "/api/v1/products" && method === "GET") {
      if (!requireScope("products:read")) {
        return errorResponse("forbidden", "Scope 'products:read' required.", 403, null, requestId, rateLimitHeaders);
      }

      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
      const offset = (page - 1) * limit;
      const search = url.searchParams.get("search") || "";
      const categoryId = url.searchParams.get("category_id") || "";

      let query = db
        .from("products")
        .select("*, product_variants(*)", { count: "exact" })
        .eq("brand_id", authContext.brandId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        query = query.ilike("name", `%${search}%`);
      }
      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      return finalizeResponse(200, {
        success: true,
        data: data || [],
        meta: {
          page,
          limit,
          total: count || 0,
          has_more: (count || 0) > offset + limit,
          request_id: requestId,
        },
      });
    }

    if (path === "/api/v1/products" && method === "POST") {
      if (!requireScope("products:write")) {
        return errorResponse("forbidden", "Scope 'products:write' required.", 403, null, requestId, rateLimitHeaders);
      }

      const { name, name_ar, description, price, sku, category_id, is_active, variants } = parsedBody || {};
      if (!name || price === undefined) {
        return errorResponse("validation_error", "Product 'name' and 'price' are required.", 400, null, requestId, rateLimitHeaders);
      }

      const { data: product, error } = await db
        .from("products")
        .insert({
          brand_id: authContext.brandId,
          user_id: authContext.brandId,
          name: name.trim(),
          name_ar: name_ar?.trim() || null,
          description: description || null,
          base_price: Number(price),
          category: category_id || null,
          is_active: is_active ?? true,
        })
        .select()
        .single();

      if (error) throw error;

      // Create variants if provided
      let createdVariants: any[] = [];
      if (Array.isArray(variants) && variants.length > 0) {
        const variantPayloads = variants.map((v) => ({
          product_id: product.id,
          brand_id: authContext.brandId,
          user_id: authContext.brandId,
          color: v.color || null,
          size: v.size || null,
          selling_price: v.price !== undefined ? Number(v.price) : Number(price),
          sku: v.sku || null,
          stock: Number(v.inventory_quantity || v.stock || 0),
        }));
        const { data: vData } = await db
          .from("product_variants")
          .insert(variantPayloads)
          .select();
        createdVariants = vData || [];
      }

      return finalizeResponse(201, {
        success: true,
        data: {
          ...product,
          variants: createdVariants,
        },
        meta: { request_id: requestId },
      });
    }

    // Match /api/v1/products/:id
    const productMatch = path.match(/^\/api\/v1\/products\/([a-zA-Z0-9_-]+)$/);
    if (productMatch) {
      const productId = productMatch[1];

      if (method === "GET") {
        if (!requireScope("products:read")) {
          return errorResponse("forbidden", "Scope 'products:read' required.", 403, null, requestId, rateLimitHeaders);
        }

        const { data: product, error } = await db
          .from("products")
          .select("*, product_variants(*)")
          .eq("id", productId)
          .eq("brand_id", authContext.brandId)
          .single();

        if (error || !product) {
          return errorResponse("not_found", "Product not found.", 404, null, requestId, rateLimitHeaders);
        }

        return finalizeResponse(200, {
          success: true,
          data: product,
          meta: { request_id: requestId },
        });
      }

      if (method === "PUT" || method === "PATCH") {
        if (!requireScope("products:write")) {
          return errorResponse("forbidden", "Scope 'products:write' required.", 403, null, requestId, rateLimitHeaders);
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (parsedBody.name !== undefined) updates.name = parsedBody.name;
        if (parsedBody.name_ar !== undefined) updates.name_ar = parsedBody.name_ar;
        if (parsedBody.description !== undefined) updates.description = parsedBody.description;
        if (parsedBody.price !== undefined) updates.base_price = Number(parsedBody.price);
        if (parsedBody.is_active !== undefined) updates.is_active = Boolean(parsedBody.is_active);

        const { data: updated, error } = await db
          .from("products")
          .update(updates)
          .eq("id", productId)
          .eq("brand_id", authContext.brandId)
          .select("*, product_variants(*)")
          .single();

        if (error || !updated) {
          return errorResponse("not_found", "Product not found or update failed.", 404, null, requestId, rateLimitHeaders);
        }

        return finalizeResponse(200, {
          success: true,
          data: updated,
          meta: { request_id: requestId },
        });
      }

      if (method === "DELETE") {
        if (!requireScope("products:write")) {
          return errorResponse("forbidden", "Scope 'products:write' required.", 403, null, requestId, rateLimitHeaders);
        }

        const { error } = await db
          .from("products")
          .delete()
          .eq("id", productId)
          .eq("brand_id", authContext.brandId);

        if (error) throw error;

        return finalizeResponse(200, {
          success: true,
          data: { id: productId, deleted: true },
          meta: { request_id: requestId },
        });
      }
    }

    // ========================================================================
    // RESOURCE: INVENTORY
    // ========================================================================
    if (path === "/api/v1/inventory" && method === "GET") {
      if (!requireScope("inventory:read")) {
        return errorResponse("forbidden", "Scope 'inventory:read' required.", 403, null, requestId, rateLimitHeaders);
      }

      const { data: variants, error } = await db
        .from("product_variants")
        .select("id, product_id, sku, selling_price, stock, products!inner(brand_id, name)")
        .eq("products.brand_id", authContext.brandId);

      if (error) throw error;

      return finalizeResponse(200, {
        success: true,
        data: variants || [],
        meta: { request_id: requestId },
      });
    }

    if (path === "/api/v1/inventory/adjust" && method === "POST") {
      if (!requireScope("inventory:write")) {
        return errorResponse("forbidden", "Scope 'inventory:write' required.", 403, null, requestId, rateLimitHeaders);
      }

      const { variant_id, delta_quantity, reason } = parsedBody || {};
      if (!variant_id || delta_quantity === undefined) {
        return errorResponse("validation_error", "'variant_id' and 'delta_quantity' (integer) are required.", 400, null, requestId, rateLimitHeaders);
      }

      // Verify variant belongs to brand
      const { data: variant, error: vErr } = await db
        .from("product_variants")
        .select("id, stock, products!inner(brand_id)")
        .eq("id", variant_id)
        .eq("products.brand_id", authContext.brandId)
        .single();

      if (vErr || !variant) {
        return errorResponse("not_found", "Variant not found or access denied.", 404, null, requestId, rateLimitHeaders);
      }

      const currentQty = (variant as any).stock || 0;
      const newQty = Math.max(0, currentQty + Number(delta_quantity));
      const { data: updated, error: uErr } = await db
        .from("product_variants")
        .update({ stock: newQty, updated_at: new Date().toISOString() })
        .eq("id", variant_id)
        .select()
        .single();

      if (uErr) throw uErr;

      // Trigger Webhook
      dispatchBrandWebhookEvent({
        brandId: authContext.brandId,
        eventName: "inventory.updated",
        payload: {
          variant_id,
          previous_quantity: currentQty,
          new_quantity: newQty,
          delta: delta_quantity,
          reason: reason || "api_adjustment",
        },
      }).catch((e) => console.warn("Webhook dispatch error:", e));

      return finalizeResponse(200, {
        success: true,
        data: {
          variant_id,
          stock: newQty,
          adjusted_by: delta_quantity,
          reason: reason || "api_adjustment",
        },
        meta: { request_id: requestId },
      });
    }

    // ========================================================================
    // RESOURCE: ORDERS
    // ========================================================================
    if (path === "/api/v1/orders" && method === "GET") {
      if (!requireScope("orders:read")) {
        return errorResponse("forbidden", "Scope 'orders:read' required.", 403, null, requestId, rateLimitHeaders);
      }

      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
      const offset = (page - 1) * limit;
      const status = url.searchParams.get("status") || "";
      const customerId = url.searchParams.get("customer_id") || "";

      let query = db
        .from("orders")
        .select("*, order_items(*)", { count: "exact" })
        .eq("brand_id", authContext.brandId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq("status", status);
      if (customerId) query = query.eq("customer_id", customerId);

      const { data, count, error } = await query;
      if (error) throw error;

      return finalizeResponse(200, {
        success: true,
        data: data || [],
        meta: {
          page,
          limit,
          total: count || 0,
          has_more: (count || 0) > offset + limit,
          request_id: requestId,
        },
      });
    }

    if (path === "/api/v1/orders" && method === "POST") {
      if (!requireScope("orders:write")) {
        return errorResponse("forbidden", "Scope 'orders:write' required.", 403, null, requestId, rateLimitHeaders);
      }

      const { customer_name, customer_phone, customer_email, address, items, subtotal, total, notes } = parsedBody || {};
      if (!items || !Array.isArray(items) || items.length === 0) {
        return errorResponse("validation_error", "Order 'items' array is required.", 400, null, requestId, rateLimitHeaders);
      }

      const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
      const { data: order, error: oErr } = await db
        .from("orders")
        .insert({
          brand_id: authContext.brandId,
          user_id: authContext.brandId,
          customer_snapshot: {
            name: customer_name || "Guest Customer",
            phone: customer_phone || null,
            email: customer_email || null,
            address: address || null,
          },
          subtotal: Number(subtotal || total || 0),
          total: Number(total || subtotal || 0),
          status: "pending",
          notes: notes || "Created via Public API v1",
        })
        .select()
        .single();

      if (oErr) throw oErr;

      // Insert line items
      const itemRows = items.map((it: any) => ({
        order_id: order.id,
        brand_id: authContext.brandId,
        user_id: authContext.brandId,
        product_id: it.product_id,
        variant_id: it.variant_id || null,
        description: it.title || it.name || "Item",
        price: Number(it.price || 0),
        quantity: Number(it.quantity || it.qty || 1),
        total: Number((it.price || 0) * (it.quantity || 1)),
      }));

      const { data: createdItems } = await db
        .from("order_items")
        .insert(itemRows)
        .select();

      // Trigger Webhook Event
      dispatchBrandWebhookEvent({
        brandId: authContext.brandId,
        eventName: "order.created",
        payload: {
          order_id: (order as any).id,
          order_number: (order as any).order_number || (order as any).id,
          total: (order as any).total,
          customer_name: customer_name || "Customer",
          items: createdItems || [],
        },
      }).catch((e) => console.warn("Webhook error:", e));

      return finalizeResponse(201, {
        success: true,
        data: {
          ...order,
          items: createdItems || [],
        },
        meta: { request_id: requestId },
      });
    }

    // Match /api/v1/orders/:id
    const orderMatch = path.match(/^\/api\/v1\/orders\/([a-zA-Z0-9_-]+)$/);
    if (orderMatch && method === "GET") {
      if (!requireScope("orders:read")) {
        return errorResponse("forbidden", "Scope 'orders:read' required.", 403, null, requestId, rateLimitHeaders);
      }

      const orderId = orderMatch[1];
      const { data: order, error } = await db
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", orderId)
        .eq("brand_id", authContext.brandId)
        .single();

      if (error || !order) {
        return errorResponse("not_found", "Order not found.", 404, null, requestId, rateLimitHeaders);
      }

      return finalizeResponse(200, {
        success: true,
        data: order,
        meta: { request_id: requestId },
      });
    }

    // Match /api/v1/orders/:id/status
    const orderStatusMatch = path.match(/^\/api\/v1\/orders\/([a-zA-Z0-9_-]+)\/status$/);
    if (orderStatusMatch && (method === "PUT" || method === "PATCH")) {
      if (!requireScope("orders:write")) {
        return errorResponse("forbidden", "Scope 'orders:write' required.", 403, null, requestId, rateLimitHeaders);
      }

      const orderId = orderStatusMatch[1];
      const { status } = parsedBody || {};
      if (!status) {
        return errorResponse("validation_error", "'status' field is required.", 400, null, requestId, rateLimitHeaders);
      }

      const { data: updated, error } = await db
        .from("orders")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", orderId)
        .eq("brand_id", authContext.brandId)
        .select()
        .single();

      if (error || !updated) {
        return errorResponse("not_found", "Order not found or update failed.", 404, null, requestId, rateLimitHeaders);
      }

      // Determine webhook event
      let eventName: "order.updated" | "order.completed" | "order.cancelled" = "order.updated";
      if (status === "delivered" || status === "completed") eventName = "order.completed";
      if (status === "cancelled") eventName = "order.cancelled";

      dispatchBrandWebhookEvent({
        brandId: authContext.brandId,
        eventName,
        payload: {
          order_id: (updated as any).id,
          order_number: (updated as any).order_number || (updated as any).id,
          new_status: status,
        },
      }).catch((e) => console.warn("Webhook error:", e));

      return finalizeResponse(200, {
        success: true,
        data: updated,
        meta: { request_id: requestId },
      });
    }

    // ========================================================================
    // RESOURCE: CUSTOMERS
    // ========================================================================
    if (path === "/api/v1/customers" && method === "GET") {
      if (!requireScope("customers:read")) {
        return errorResponse("forbidden", "Scope 'customers:read' required.", 403, null, requestId, rateLimitHeaders);
      }

      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || "20")));
      const search = url.searchParams.get("search");

      let query = db
        .from("customers")
        .select("*")
        .eq("brand_id", authContext.brandId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return finalizeResponse(200, {
        success: true,
        data: data || [],
        meta: { request_id: requestId, count: data?.length || 0 },
      });
    }

    // ========================================================================
    // RESOURCE: RETURNS & EXCHANGES
    // ========================================================================
    if (path === "/api/v1/returns" && method === "GET") {
      if (!requireScope("returns:read")) {
        return errorResponse("forbidden", "Scope 'returns:read' required.", 403, null, requestId, rateLimitHeaders);
      }

      const { data, error } = await db
        .from("return_requests")
        .select("*, return_items(*)")
        .eq("brand_id", authContext.brandId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      return finalizeResponse(200, {
        success: true,
        data: data || [],
        meta: { request_id: requestId },
      });
    }

    // ========================================================================
    // RESOURCE: LOYALTY & REWARDS
    // ========================================================================
    const loyaltyBalanceMatch = path.match(/^\/api\/v1\/loyalty\/balance\/([a-zA-Z0-9_-]+)$/);
    if (loyaltyBalanceMatch && method === "GET") {
      if (!requireScope("loyalty:read")) {
        return errorResponse("forbidden", "Scope 'loyalty:read' required.", 403, null, requestId, rateLimitHeaders);
      }

      const customerId = loyaltyBalanceMatch[1];
      const { data: account, error } = await db
        .from("loyalty_accounts")
        .select("*")
        .eq("brand_id", authContext.brandId)
        .eq("customer_id", customerId)
        .single();

      return finalizeResponse(200, {
        success: true,
        data: account || {
          customer_id: customerId,
          active_points: 0,
          pending_points: 0,
          lifetime_spend: 0,
          current_tier_key: "bronze",
        },
        meta: { request_id: requestId },
      });
    }

    if (path === "/api/v1/loyalty/adjust" && method === "POST") {
      if (!requireScope("loyalty:write")) {
        return errorResponse("forbidden", "Scope 'loyalty:write' required.", 403, null, requestId, rateLimitHeaders);
      }

      const { customer_id, points, reason } = parsedBody || {};
      if (!customer_id || points === undefined) {
        return errorResponse("validation_error", "'customer_id' and 'points' integer are required.", 400, null, requestId, rateLimitHeaders);
      }

      // Upsert account
      const { data: account } = await db
        .from("loyalty_accounts")
        .select("*")
        .eq("brand_id", authContext.brandId)
        .eq("customer_id", customer_id)
        .single();

      const currentBalance = account?.active_points || 0;
      const nextBalance = Math.max(0, currentBalance + Number(points));

      await db.from("loyalty_accounts").upsert({
        brand_id: authContext.brandId,
        customer_id,
        active_points: nextBalance,
        updated_at: new Date().toISOString(),
      });

      // Insert ledger entry
      await db.from("loyalty_ledger").insert({
        brand_id: authContext.brandId,
        customer_id,
        event_type: Number(points) >= 0 ? "manual_award" : "manual_deduct",
        points: Number(points),
        balance_after: nextBalance,
        reason: reason || "API Adjustment",
      });

      // Trigger Webhook Event
      dispatchBrandWebhookEvent({
        brandId: authContext.brandId,
        eventName: "loyalty.balance_changed",
        payload: {
          customer_id,
          points_change: Number(points),
          new_balance: nextBalance,
          reason,
        },
      }).catch((e) => console.warn("Webhook error:", e));

      return finalizeResponse(200, {
        success: true,
        data: {
          customer_id,
          previous_balance: currentBalance,
          new_balance: nextBalance,
          adjusted_points: Number(points),
        },
        meta: { request_id: requestId },
      });
    }

    // ========================================================================
    // RESOURCE: CATEGORIES & DISCOUNTS
    // ========================================================================
    if (path === "/api/v1/categories" && method === "GET") {
      if (!requireScope("products:read")) {
        return errorResponse("forbidden", "Scope 'products:read' required.", 403, null, requestId, rateLimitHeaders);
      }

      const { data, error } = await db
        .from("categories")
        .select("*")
        .eq("brand_id", authContext.brandId)
        .order("name", { ascending: true });

      if (error) throw error;

      return finalizeResponse(200, {
        success: true,
        data: data || [],
        meta: { request_id: requestId },
      });
    }

    if (path === "/api/v1/discounts" && method === "GET") {
      if (!requireScope("discounts:read")) {
        return errorResponse("forbidden", "Scope 'discounts:read' required.", 403, null, requestId, rateLimitHeaders);
      }

      const { data, error } = await db
        .from("promo_codes")
        .select("*")
        .eq("brand_id", authContext.brandId);

      if (error) throw error;

      return finalizeResponse(200, {
        success: true,
        data: data || [],
        meta: { request_id: requestId },
      });
    }

    // No matching route
    return errorResponse(
      "route_not_found",
      `The requested endpoint '${method} ${path}' does not exist in Boutq OS Public API v1.`,
      404,
      null,
      requestId,
      rateLimitHeaders,
    );
  } catch (error: any) {
    console.error(`[Public API v1 Error] Request ID ${requestId}:`, error);
    return errorResponse(
      "internal_server_error",
      "An unexpected server error occurred. Please contact support with the request ID.",
      500,
      null,
      requestId,
      rateLimitHeaders,
    );
  }
}
