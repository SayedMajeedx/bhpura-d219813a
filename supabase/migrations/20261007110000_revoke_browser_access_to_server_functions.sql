-- Functions the browser must not be able to call.
--
-- An audit of the live database found SECURITY DEFINER functions that any visitor (anon) or any
-- signed-in account (authenticated, which includes every shopper who signs up on a storefront)
-- could call straight through the public API key, with no check inside the function:
--
--   * get_integration_credential_secret   returns a brand's decrypted payment, email and AI keys
--   * reconcile_verified_tap_order        marks a card order paid from a charge id the buyer sees
--   * courier_update_delivery (old form)  marks any order paid and delivered
--   * rpc_consume_usage, rpc_check_entitlement   spend or read another brand's plan quota
--   * apply_whatsapp_delivery_status      rewrites message delivery states
--
-- Every one of them is called only by the server (the Worker's routes and server functions, the
-- edge functions), which use the service role and keep their EXECUTE grant, so nothing the app
-- does changes.
--
-- Four more guard themselves with `IF auth.uid() IS NOT NULL AND NOT can_access_brand(...)`, which
-- is skipped for an anonymous caller (auth.uid() is NULL), so an anonymous visitor could set any
-- variant's stock or rewrite any order's lines. A signed-in caller is checked correctly, and the
-- admin screens that call them are signed in, so only the anonymous grant is removed:
--
--   * rpc_adjust_variant_stock, apply_inventory_movement, replace_order_items, reconcile_inventory
--
-- Not touched here, on purpose: the loyalty award/redeem and abandoned-cart coupon functions are
-- still called from the shopper's browser, so removing the grant now would break checkout for
-- stores that use them. They move to the server in their own change.
--
-- Additive in effect (grants only): no table, column or function body changes. Idempotent: REVOKE
-- of a grant that is already gone does nothing.

-- Server only.
REVOKE EXECUTE ON FUNCTION public.get_integration_credential_secret(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_verified_tap_order(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_verified_tap_order(uuid, uuid, text, text, numeric, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.courier_update_delivery(uuid, uuid, boolean, numeric, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_consume_usage(uuid, text, bigint, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_check_entitlement(uuid, text, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_whatsapp_delivery_status(text, text, timestamp with time zone, text)
  FROM PUBLIC, anon, authenticated;

-- Signed-in staff only (their brand check still applies).
REVOKE EXECUTE ON FUNCTION public.rpc_adjust_variant_stock(uuid, text, text, integer, text, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_inventory_movement(uuid, uuid, text, integer, text, text, uuid, text, uuid, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.replace_order_items(uuid, jsonb)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_inventory(uuid)
  FROM PUBLIC, anon;
