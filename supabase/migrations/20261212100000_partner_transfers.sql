-- Partner transfers: every batch of pieces sent to a partner shop, returned to the store, or moved
-- from one partner shop to another is one record with a number of its own (TR-0001), and keeps a
-- copy of each line as it was sent (the piece's names, size, colour, codes, price and commission
-- that day), so the partner's sheet for a batch can be made again later and say the same thing.
--
-- Moving between partners (the owner's request of 2026-11-17: Pura is leaving one partner shop for
-- another) was not possible: a piece had to be returned to the store and sent again, two steps with
-- nothing linking them and the partner's code lost. `move_stock_between_incubators` lowers the
-- first partner's count and raises the second's in one transaction. The store's total at partners
-- does not change, so nothing goes through the stock ledger and the nightly reconciliation still
-- finds the partners' counts equal to the total.
--
-- Run in a real Postgres by tests/partner-transfers-migration.test.ts.

-- 1. The records ---------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.incubator_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  -- One number per store, counting up: TR-0001, TR-0002...
  number integer NOT NULL,
  -- send: the store to a partner; return: a partner to the store; move: a partner to another.
  kind text NOT NULL CHECK (kind IN ('send', 'return', 'move')),
  from_incubator_id uuid REFERENCES public.incubators(id) ON DELETE RESTRICT,
  to_incubator_id uuid REFERENCES public.incubators(id) ON DELETE RESTRICT,
  pieces integer NOT NULL DEFAULT 0 CHECK (pieces >= 0),
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, number),
  CONSTRAINT incubator_transfers_ends CHECK (
    (kind = 'send' AND from_incubator_id IS NULL AND to_incubator_id IS NOT NULL)
    OR (kind = 'return' AND from_incubator_id IS NOT NULL AND to_incubator_id IS NULL)
    OR (kind = 'move' AND from_incubator_id IS NOT NULL AND to_incubator_id IS NOT NULL
        AND from_incubator_id <> to_incubator_id)
  )
);

CREATE INDEX IF NOT EXISTS incubator_transfers_brand_created
  ON public.incubator_transfers (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS incubator_transfers_from ON public.incubator_transfers (from_incubator_id);
CREATE INDEX IF NOT EXISTS incubator_transfers_to ON public.incubator_transfers (to_incubator_id);

CREATE TABLE IF NOT EXISTS public.incubator_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.incubator_transfers(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  -- At the partner that received the pieces (none for a return to the store).
  external_code text,
  price numeric,
  commission_type text,
  commission_value numeric,
  -- The code the pieces carried at the partner they left (a move or a return).
  previous_code text,
  -- The piece as it was named that day.
  product_name text,
  product_name_ar text,
  product_name_en text,
  size text,
  color text,
  sku text,
  barcode text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incubator_transfer_items_transfer
  ON public.incubator_transfer_items (transfer_id);

-- Read by the store's staff; written only by the functions below.
ALTER TABLE public.incubator_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incubator_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS incubator_transfers_staff_read ON public.incubator_transfers;
CREATE POLICY incubator_transfers_staff_read ON public.incubator_transfers
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS incubator_transfer_items_staff_read ON public.incubator_transfer_items;
CREATE POLICY incubator_transfer_items_staff_read ON public.incubator_transfer_items
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

REVOKE ALL ON public.incubator_transfers FROM anon, authenticated;
REVOKE ALL ON public.incubator_transfer_items FROM anon, authenticated;
GRANT SELECT ON public.incubator_transfers TO authenticated;
GRANT SELECT ON public.incubator_transfer_items TO authenticated;

-- A partner's history says when pieces moved to or came from another partner.
ALTER TABLE public.incubator_movements
  DROP CONSTRAINT IF EXISTS incubator_movements_movement_type_check;
ALTER TABLE public.incubator_movements
  ADD CONSTRAINT incubator_movements_movement_type_check CHECK (
    movement_type = ANY (ARRAY[
      'transfer_in', 'return', 'sale', 'sale_reversal', 'adjustment',
      'order_reserve', 'order_release', 'move_out', 'move_in'
    ])
  );

-- 2. Helpers (the server's own, never a browser's) -----------------------------------------------

-- Opens a transfer with the store's next number.
CREATE OR REPLACE FUNCTION public.incubator_transfer_open(
  p_brand_id uuid, p_kind text, p_from uuid, p_to uuid, p_notes text
) RETURNS public.incubator_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.incubator_transfers;
BEGIN
  -- One number at a time per store.
  PERFORM pg_advisory_xact_lock(hashtext('incubator_transfers:' || p_brand_id::text));
  INSERT INTO public.incubator_transfers (brand_id, number, kind, from_incubator_id, to_incubator_id,
    notes, created_by)
  SELECT p_brand_id, COALESCE(max(number), 0) + 1, p_kind, p_from, p_to,
    NULLIF(left(trim(COALESCE(p_notes, '')), 1000), ''), auth.uid()
  FROM public.incubator_transfers WHERE brand_id = p_brand_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

-- Keeps a line of a transfer as it is now, and stamps the partner's history of it with the
-- transfer, so each line of the history says which batch it belongs to.
CREATE OR REPLACE FUNCTION public.incubator_transfer_add_item(
  p_transfer public.incubator_transfers, p_variant_id uuid, p_quantity integer,
  p_previous_code text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_line public.incubator_inventory;
BEGIN
  IF p_transfer.to_incubator_id IS NOT NULL THEN
    SELECT * INTO v_line FROM public.incubator_inventory
    WHERE incubator_id = p_transfer.to_incubator_id AND variant_id = p_variant_id;
  END IF;

  INSERT INTO public.incubator_transfer_items (transfer_id, brand_id, variant_id, quantity,
    external_code, price, commission_type, commission_value, previous_code,
    product_name, product_name_ar, product_name_en, size, color, sku, barcode)
  SELECT p_transfer.id, p_transfer.brand_id, v.id, p_quantity,
    v_line.external_code, v_line.consignment_price, v_line.commission_type, v_line.commission_value,
    NULLIF(trim(COALESCE(p_previous_code, '')), ''),
    p.name, p.name_ar, p.name_en, v.size, v.color, v.sku, v.barcode
  FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
  WHERE v.id = p_variant_id;

  UPDATE public.incubator_movements
  SET reference_type = 'incubator_transfer', reference_id = p_transfer.id
  WHERE brand_id = p_transfer.brand_id
    AND variant_id = p_variant_id
    AND reference_id IS NULL
    AND created_at = now()
    AND movement_type IN ('transfer_in', 'return', 'move_out', 'move_in')
    AND incubator_id IN (p_transfer.from_incubator_id, p_transfer.to_incubator_id);

  UPDATE public.incubator_transfers SET pieces = pieces + p_quantity WHERE id = p_transfer.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.incubator_transfer_open(uuid, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.incubator_transfer_add_item(public.incubator_transfers, uuid, integer, text)
  FROM PUBLIC, anon, authenticated;

-- What a batch's lines may be: 1 to 500 of them, each a size and a whole number of pieces.
CREATE OR REPLACE FUNCTION public.incubator_transfer_check_items(p_items jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'NOTHING_TO_TRANSFER';
  END IF;
  IF jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION 'TOO_MANY_PIECES_IN_ONE_TRANSFER';
  END IF;
END;
$function$;

-- The caller may move this store's partner stock.
CREATE OR REPLACE FUNCTION public.incubator_transfer_caller_may(p_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT p_brand_id IS NOT NULL
    AND public.can_access_brand(p_brand_id)
    AND public.has_permission('manage_inventory');
$function$;

-- 3. Sending pieces from the store to a partner, as a numbered batch ----------------------------

CREATE OR REPLACE FUNCTION public.send_stock_to_incubator(
  p_incubator_id uuid, p_items jsonb, p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid;
  v_transfer public.incubator_transfers;
  v_item jsonb;
  v_variant uuid;
  v_quantity integer;
BEGIN
  SELECT brand_id INTO v_brand FROM public.incubators WHERE id = p_incubator_id AND is_active;
  IF NOT public.incubator_transfer_caller_may(v_brand) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  PERFORM public.incubator_transfer_check_items(p_items);
  v_transfer := public.incubator_transfer_open(v_brand, 'send', NULL, p_incubator_id, p_notes);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_variant := (v_item ->> 'variant_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    BEGIN
      PERFORM public.transfer_stock_to_incubator(
        p_incubator_id,
        v_variant,
        v_quantity,
        NULLIF(trim(v_item ->> 'external_code'), ''),
        (v_item ->> 'price')::numeric,
        NULLIF(v_item ->> 'commission_type', ''),
        (v_item ->> 'commission_value')::numeric,
        p_notes
      );
    EXCEPTION WHEN OTHERS THEN
      -- The reason, then the piece it happened on: everything already moved is undone.
      RAISE EXCEPTION '%:%', split_part(SQLERRM, ':', 1), v_variant;
    END;
    PERFORM public.incubator_transfer_add_item(v_transfer, v_variant, v_quantity, NULL);
  END LOOP;

  SELECT * INTO v_transfer FROM public.incubator_transfers WHERE id = v_transfer.id;
  RETURN jsonb_build_object('transfer_id', v_transfer.id, 'number', v_transfer.number,
    'pieces', v_transfer.pieces);
END;
$function$;

-- The batch the transfer dialog has called since migration 20261012170000: now a numbered
-- transfer too, answering the pieces as before for a page left open across the release.
CREATE OR REPLACE FUNCTION public.transfer_stock_to_incubator_batch(
  p_incubator_id uuid, p_items jsonb, p_notes text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (public.send_stock_to_incubator(p_incubator_id, p_items, p_notes) ->> 'pieces')::integer;
END;
$function$;

-- 4. Returning pieces from a partner to the store, as a numbered batch -------------------------

CREATE OR REPLACE FUNCTION public.return_stock_to_store(
  p_incubator_id uuid, p_items jsonb, p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid;
  v_transfer public.incubator_transfers;
  v_item jsonb;
  v_variant uuid;
  v_quantity integer;
  v_code text;
BEGIN
  SELECT brand_id INTO v_brand FROM public.incubators WHERE id = p_incubator_id;
  IF NOT public.incubator_transfer_caller_may(v_brand) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  PERFORM public.incubator_transfer_check_items(p_items);
  v_transfer := public.incubator_transfer_open(v_brand, 'return', p_incubator_id, NULL, p_notes);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_variant := (v_item ->> 'variant_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    SELECT external_code INTO v_code FROM public.incubator_inventory
    WHERE incubator_id = p_incubator_id AND variant_id = v_variant;
    BEGIN
      PERFORM public.return_stock_from_incubator(p_incubator_id, v_variant, v_quantity, p_notes);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION '%:%', split_part(SQLERRM, ':', 1), v_variant;
    END;
    PERFORM public.incubator_transfer_add_item(v_transfer, v_variant, v_quantity, v_code);
  END LOOP;

  SELECT * INTO v_transfer FROM public.incubator_transfers WHERE id = v_transfer.id;
  RETURN jsonb_build_object('transfer_id', v_transfer.id, 'number', v_transfer.number,
    'pieces', v_transfer.pieces);
END;
$function$;

-- 5. Moving pieces from one partner to another -------------------------------------------------

-- Each item: { variant_id, quantity, price?, external_code? }. A price not sent is the size's
-- selling price, else what the first partner sold it at; a code not sent keeps the one the second
-- partner already has for the size, else none. The commission is the second partner's own terms.
-- Only the pieces the first partner holds free are moved: a piece taken by a store order or held
-- for a pickup has already left its count.
CREATE OR REPLACE FUNCTION public.move_stock_between_incubators(
  p_from_incubator_id uuid, p_to_incubator_id uuid, p_items jsonb, p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from public.incubators;
  v_to public.incubators;
  v_transfer public.incubator_transfers;
  v_item jsonb;
  v_variant uuid;
  v_quantity integer;
  v_line public.incubator_inventory;
  v_price numeric;
  v_selling numeric;
BEGIN
  SELECT * INTO v_from FROM public.incubators WHERE id = p_from_incubator_id;
  SELECT * INTO v_to FROM public.incubators WHERE id = p_to_incubator_id;
  IF v_from.id IS NULL OR v_to.id IS NULL OR v_from.brand_id IS DISTINCT FROM v_to.brand_id
     OR NOT public.incubator_transfer_caller_may(v_from.brand_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF v_from.id = v_to.id THEN
    RAISE EXCEPTION 'SAME_PARTNER';
  END IF;
  IF NOT v_to.is_active THEN
    RAISE EXCEPTION 'PARTNER_INACTIVE';
  END IF;
  PERFORM public.incubator_transfer_check_items(p_items);
  v_transfer := public.incubator_transfer_open(v_from.brand_id, 'move', v_from.id, v_to.id, p_notes);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_variant := (v_item ->> 'variant_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    IF v_variant IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY:%', v_variant;
    END IF;

    SELECT * INTO v_line FROM public.incubator_inventory
    WHERE incubator_id = v_from.id AND variant_id = v_variant
    FOR UPDATE;
    IF v_line.id IS NULL OR v_line.quantity < v_quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_INCUBATOR_STOCK:%', v_variant;
    END IF;

    UPDATE public.incubator_inventory SET quantity = quantity - v_quantity WHERE id = v_line.id;

    SELECT selling_price INTO v_selling FROM public.product_variants WHERE id = v_variant;
    v_price := COALESCE(NULLIF((v_item ->> 'price')::numeric, 0), NULLIF(v_selling, 0),
      v_line.consignment_price, 0);
    IF v_price < 0 THEN
      RAISE EXCEPTION 'INVALID_PRICE:%', v_variant;
    END IF;

    INSERT INTO public.incubator_inventory (brand_id, incubator_id, variant_id, external_code,
      quantity, consignment_price, commission_type, commission_value)
    VALUES (v_to.brand_id, v_to.id, v_variant,
      NULLIF(left(trim(COALESCE(v_item ->> 'external_code', '')), 100), ''), v_quantity, v_price,
      v_to.commission_type, v_to.commission_value)
    ON CONFLICT (incubator_id, variant_id) DO UPDATE SET
      quantity = incubator_inventory.quantity + EXCLUDED.quantity,
      external_code = COALESCE(EXCLUDED.external_code, incubator_inventory.external_code),
      consignment_price = EXCLUDED.consignment_price,
      commission_type = EXCLUDED.commission_type,
      commission_value = EXCLUDED.commission_value;

    INSERT INTO public.incubator_movements (brand_id, incubator_id, variant_id, movement_type,
      quantity_delta, notes)
    VALUES
      (v_from.brand_id, v_from.id, v_variant, 'move_out', -v_quantity, p_notes),
      (v_to.brand_id, v_to.id, v_variant, 'move_in', v_quantity, p_notes);

    PERFORM public.incubator_transfer_add_item(v_transfer, v_variant, v_quantity,
      v_line.external_code);
  END LOOP;

  SELECT * INTO v_transfer FROM public.incubator_transfers WHERE id = v_transfer.id;
  RETURN jsonb_build_object('transfer_id', v_transfer.id, 'number', v_transfer.number,
    'pieces', v_transfer.pieces);
END;
$function$;

REVOKE ALL ON FUNCTION public.send_stock_to_incubator(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.return_stock_to_store(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.move_stock_between_incubators(uuid, uuid, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_stock_to_incubator(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_stock_to_store(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_stock_between_incubators(uuid, uuid, jsonb, text)
  TO authenticated;
