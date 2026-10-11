-- Partner money: a payment can be voided, the figures are added up by the database, the
-- settlement day is put to use, and a batch of transfers happens together or not at all.
--
-- 1. A payment recorded by mistake could not be undone, and a sale it settled could then never
--    be reversed. void_incubator_payment takes it back: the sales it settled owe their part
--    again, and the payment stays on record as voided, with who and why.
-- 2. The partners' page added a partner's figures in the browser from every sale it had
--    loaded, and the API cuts a list at its row limit without saying so: past that, the
--    amount due would have been wrong. incubator_summaries adds them up in the database.
-- 3. A partner's settlement day was saved and used nowhere. The same function says when the
--    last and the next settlement fall, and what is overdue: what is still unpaid for sales
--    made before the last settlement day.
-- 4. The batch transfer sent one request per piece. A failure midway left half of it done
--    (and the screen announced the whole). transfer_stock_to_incubator_batch does all of it
--    in one transaction, and names the piece that stopped it.

-- 1. Voiding a payment ----------------------------------------------------------------------

ALTER TABLE public.incubator_payments
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;

CREATE OR REPLACE FUNCTION public.void_incubator_payment(p_payment_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment public.incubator_payments%ROWTYPE;
  v_reason text := NULLIF(trim(p_reason), '');
  r record;
BEGIN
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'VOID_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_payment FROM public.incubator_payments WHERE id = p_payment_id;
  IF NOT FOUND
     OR auth.uid() IS NULL
     OR NOT public.can_access_brand(v_payment.brand_id)
     OR NOT public.has_permission('manage_inventory') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- The partner's row first, as record_incubator_payment does, so the two never interleave.
  PERFORM 1 FROM public.incubators WHERE id = v_payment.incubator_id FOR UPDATE;
  SELECT * INTO v_payment FROM public.incubator_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_payment.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_VOIDED';
  END IF;

  -- Each sale it settled owes its part again.
  FOR r IN
    SELECT a.sale_id, a.amount
    FROM public.incubator_payment_allocations a
    JOIN public.incubator_sales s ON s.id = a.sale_id
    WHERE a.payment_id = p_payment_id
    ORDER BY s.sold_at, s.created_at
    FOR UPDATE OF s
  LOOP
    UPDATE public.incubator_sales
    SET paid_amount = GREATEST(0, paid_amount - r.amount)
    WHERE id = r.sale_id;
  END LOOP;

  DELETE FROM public.incubator_payment_allocations WHERE payment_id = p_payment_id;

  UPDATE public.incubator_payments
  SET voided_at = now(),
      voided_by = auth.uid(),
      void_reason = v_reason
  WHERE id = p_payment_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.void_incubator_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_incubator_payment(uuid, text) TO authenticated, service_role;

-- 2 and 3. A partner's figures, and its settlement ------------------------------------------
-- Runs as the caller: the tables' own row policies decide what is read (staff of the store
-- who manage inventory). `p_today` and `p_tz` are the reader's calendar day and time zone, so
-- "before the settlement day" means the same on the screen and here.

CREATE OR REPLACE FUNCTION public.incubator_summaries(
  p_brand_id uuid,
  p_today date DEFAULT CURRENT_DATE,
  p_tz text DEFAULT 'UTC'
)
RETURNS TABLE (
  incubator_id uuid,
  units bigint,
  stock_value numeric,
  sold_units bigint,
  gross numeric,
  commission numeric,
  net numeric,
  paid numeric,
  due numeric,
  last_settlement date,
  next_settlement date,
  overdue numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH months AS (
    SELECT
      date_trunc('month', p_today)::date AS this_month,
      (date_trunc('month', p_today) - interval '1 month')::date AS last_month,
      (date_trunc('month', p_today) + interval '1 month')::date AS next_month
  ),
  partners AS (
    SELECT
      i.id,
      i.settlement_day,
      -- The settlement day in a month that is shorter than it falls on that month's last day.
      (m.this_month + (LEAST(i.settlement_day, extract(day FROM (m.this_month + interval '1 month - 1 day'))::int) - 1)) AS this_day,
      (m.last_month + (LEAST(i.settlement_day, extract(day FROM (m.last_month + interval '1 month - 1 day'))::int) - 1)) AS last_day,
      (m.next_month + (LEAST(i.settlement_day, extract(day FROM (m.next_month + interval '1 month - 1 day'))::int) - 1)) AS next_day
    FROM public.incubators i
    CROSS JOIN months m
    WHERE i.brand_id = p_brand_id
  ),
  settlement AS (
    SELECT
      p.id,
      CASE WHEN p.settlement_day IS NULL THEN NULL
           WHEN p.this_day <= p_today THEN p.this_day
           ELSE p.last_day END AS last_settlement,
      CASE WHEN p.settlement_day IS NULL THEN NULL
           WHEN p.this_day > p_today THEN p.this_day
           ELSE p.next_day END AS next_settlement
    FROM partners p
  ),
  stock AS (
    SELECT ii.incubator_id,
      sum(ii.quantity)::bigint AS units,
      sum(ii.quantity * ii.consignment_price)::numeric AS stock_value
    FROM public.incubator_inventory ii
    WHERE ii.brand_id = p_brand_id AND ii.quantity > 0
    GROUP BY ii.incubator_id
  ),
  sales AS (
    SELECT s.incubator_id,
      sum(s.quantity)::bigint AS sold_units,
      sum(s.gross_amount)::numeric AS gross,
      sum(s.commission_amount)::numeric AS commission,
      sum(s.net_due)::numeric AS net,
      sum(s.net_due - s.paid_amount)::numeric AS due,
      sum(s.net_due - s.paid_amount) FILTER (
        WHERE st.last_settlement IS NOT NULL
          AND (s.sold_at AT TIME ZONE p_tz)::date < st.last_settlement
      )::numeric AS overdue
    FROM public.incubator_sales s
    JOIN settlement st ON st.id = s.incubator_id
    WHERE s.brand_id = p_brand_id AND s.status = 'confirmed'
    GROUP BY s.incubator_id
  ),
  payments AS (
    SELECT p.incubator_id, sum(p.amount)::numeric AS paid
    FROM public.incubator_payments p
    WHERE p.brand_id = p_brand_id AND p.voided_at IS NULL
    GROUP BY p.incubator_id
  )
  SELECT
    st.id,
    COALESCE(stock.units, 0),
    round(COALESCE(stock.stock_value, 0), 3),
    COALESCE(sales.sold_units, 0),
    round(COALESCE(sales.gross, 0), 3),
    round(COALESCE(sales.commission, 0), 3),
    round(COALESCE(sales.net, 0), 3),
    round(COALESCE(payments.paid, 0), 3),
    round(COALESCE(sales.due, 0), 3),
    st.last_settlement,
    st.next_settlement,
    round(GREATEST(COALESCE(sales.overdue, 0), 0), 3)
  FROM settlement st
  LEFT JOIN stock ON stock.incubator_id = st.id
  LEFT JOIN sales ON sales.incubator_id = st.id
  LEFT JOIN payments ON payments.incubator_id = st.id;
$function$;

REVOKE ALL ON FUNCTION public.incubator_summaries(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incubator_summaries(uuid, date, text) TO authenticated, service_role;

-- 4. A batch of transfers, together or not at all -------------------------------------------
-- Runs as the caller and calls transfer_stock_to_incubator for each piece, which checks the
-- caller and the stock itself. One failure undoes everything, and says which piece it was:
-- '<the reason>:<variant id>'.

CREATE OR REPLACE FUNCTION public.transfer_stock_to_incubator_batch(
  p_incubator_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_variant uuid;
  v_quantity integer;
  v_pieces integer := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'NOTHING_TO_TRANSFER';
  END IF;
  IF jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION 'TOO_MANY_PIECES_IN_ONE_TRANSFER';
  END IF;

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
    v_pieces := v_pieces + v_quantity;
  END LOOP;

  RETURN v_pieces;
END;
$function$;

REVOKE ALL ON FUNCTION public.transfer_stock_to_incubator_batch(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_stock_to_incubator_batch(uuid, jsonb, text)
  TO authenticated, service_role;
