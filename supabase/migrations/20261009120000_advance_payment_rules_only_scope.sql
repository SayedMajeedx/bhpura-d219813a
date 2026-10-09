-- Advance payment: "only my own rules".
--
-- A store's own advance rules are tried first and its general rule (a percentage and an
-- "applies to") takes what they leave, so a store could never say "ask only what my own rules
-- ask": the general share could not be switched off. A new scope, 'rules_only', makes the
-- general rule empty, so a line no own rule reaches pays no advance.
--
-- Additive: the two scope checks accept one more value, and advance_default_rules returns no
-- rules for it. Nothing changes for the four existing scopes.

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_advance_payment_scope_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_advance_payment_scope_check
  CHECK (advance_payment_scope IN
    ('all', 'made_to_order', 'delivery', 'made_to_order_or_delivery', 'rules_only'));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_advance_scope_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_advance_scope_check
  CHECK (advance_scope IS NULL OR advance_scope IN
    ('all', 'made_to_order', 'delivery', 'made_to_order_or_delivery', 'rules_only'));

CREATE OR REPLACE FUNCTION public.advance_default_rules(p_percent numeric, p_scope text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE COALESCE(p_scope, 'all')
    WHEN 'rules_only' THEN '[]'::jsonb
    WHEN 'made_to_order' THEN jsonb_build_array(
      jsonb_build_object('made_to_order', true, 'kind', 'percent', 'value', p_percent, 'include_fee', false))
    WHEN 'delivery' THEN jsonb_build_array(
      jsonb_build_object('fulfillment', jsonb_build_array('delivery'), 'kind', 'percent', 'value', p_percent, 'include_fee', true))
    WHEN 'made_to_order_or_delivery' THEN jsonb_build_array(
      jsonb_build_object('fulfillment', jsonb_build_array('delivery'), 'kind', 'percent', 'value', p_percent, 'include_fee', true),
      jsonb_build_object('made_to_order', true, 'kind', 'percent', 'value', p_percent, 'include_fee', false))
    ELSE jsonb_build_array(
      jsonb_build_object('kind', 'percent', 'value', p_percent, 'include_fee', true))
  END
$function$;
