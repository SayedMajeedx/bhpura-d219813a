-- A full stock count (improvement 4 of the final report, 2026-11-27; the owner's go of 2026-11-28).
-- A store counted its shelves one size at a time ("count correction" in the stock dialog). Now it
-- can count the whole store or one category at once, with several members of staff counting on
-- their phones (a scanner or typing), and apply every difference in one step through the ledger.
--
--   - `stock_counts`: one count, numbered per store (SC-0001), the whole store or one category;
--     counting, then applied or cancelled; at most one counting at a time per store.
--   - `stock_count_lines`: every size it counts, with the store's stock when it started
--     (`expected`) and what was counted, by whom and when. Pieces at partner shops are not counted
--     here: they have their own transfers and statements.
--   - Written only by the functions below (staff with `manage_inventory`), read by the store's
--     staff.
--   - **What an order does during a count is not a loss**: a size's difference is what was counted
--     against the stock it had when it was counted (`expected` plus what moved on the shelf between
--     the start and that moment, read from the ledger: a sale, a return, a delivery from a
--     supplier); applying moves today's stock by that difference, so a sale after the size was
--     counted stays a sale. A size not counted keeps its stock.
--   - Applying is one transaction through the ledger (`apply_inventory_movement`, reason
--     `correction`, reference `stock_count`), so the nightly reconciliation agrees with it, and a
--     line keeps what it moved (`applied_delta`) for the count's report.

-- 1. The tables -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  number integer NOT NULL,
  category text,
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  status text NOT NULL DEFAULT 'counting' CHECK (status IN ('counting', 'applied', 'cancelled')),
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_by uuid,
  finished_at timestamptz,
  UNIQUE (brand_id, number)
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_counts_one_open
  ON public.stock_counts (brand_id) WHERE status = 'counting';

CREATE TABLE IF NOT EXISTS public.stock_count_lines (
  count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  expected integer NOT NULL,
  counted integer CHECK (counted IS NULL OR counted BETWEEN 0 AND 100000),
  counted_at timestamptz,
  counted_by uuid,
  moved_during integer,
  applied_delta integer,
  PRIMARY KEY (count_id, variant_id)
);
CREATE INDEX IF NOT EXISTS stock_count_lines_variant_idx ON public.stock_count_lines (variant_id);

ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_counts_staff_read ON public.stock_counts;
CREATE POLICY stock_counts_staff_read ON public.stock_counts
  FOR SELECT TO authenticated
  USING ((SELECT is_super_admin()) OR brand_id = (SELECT staff_brand_id()));
DROP POLICY IF EXISTS stock_count_lines_staff_read ON public.stock_count_lines;
CREATE POLICY stock_count_lines_staff_read ON public.stock_count_lines
  FOR SELECT TO authenticated
  USING ((SELECT is_super_admin()) OR brand_id = (SELECT staff_brand_id()));

REVOKE ALL ON public.stock_counts FROM anon, authenticated;
REVOKE ALL ON public.stock_count_lines FROM anon, authenticated;
GRANT SELECT ON public.stock_counts TO authenticated;
GRANT SELECT ON public.stock_count_lines TO authenticated;

-- The caller may count this store's stock: a signed-in member of its staff who manages inventory.
CREATE OR REPLACE FUNCTION public.stock_count_staff(p_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.can_access_brand(p_brand_id)
     AND public.has_permission('manage_inventory');
$$;

REVOKE EXECUTE ON FUNCTION public.stock_count_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_count_staff(uuid) TO authenticated, service_role;

-- 2. Starting a count -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_stock_count(
  p_brand_id uuid,
  p_category text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category text := NULLIF(btrim(COALESCE(p_category, '')), '');
  v_number integer;
  v_id uuid;
  v_sizes integer;
BEGIN
  IF NOT public.stock_count_staff(p_brand_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('stock_count:' || p_brand_id::text));
  IF EXISTS (SELECT 1 FROM public.stock_counts WHERE brand_id = p_brand_id AND status = 'counting') THEN
    RAISE EXCEPTION 'STOCK_COUNT_OPEN';
  END IF;

  SELECT COALESCE(max(number), 0) + 1 INTO v_number FROM public.stock_counts WHERE brand_id = p_brand_id;
  INSERT INTO public.stock_counts (brand_id, number, category, note, started_by)
  VALUES (p_brand_id, v_number, v_category, NULLIF(left(btrim(COALESCE(p_note, '')), 300), ''), auth.uid())
  RETURNING id INTO v_id;

  -- Every size on the shelf: a product's sizes in use, never a service or a package; a
  -- made-to-order product only for the ready pieces it holds.
  INSERT INTO public.stock_count_lines (count_id, brand_id, variant_id, product_id, expected)
  SELECT v_id, p_brand_id, v.id, p.id, GREATEST(COALESCE(v.stock_main, 0), 0)
    FROM public.product_variants v
    JOIN public.products p ON p.id = v.product_id
   WHERE p.brand_id = p_brand_id
     AND v.archived_at IS NULL
     AND p.archived_at IS NULL
     AND COALESCE(p.item_kind, 'product') <> 'service'
     AND NOT COALESCE(p.is_package, false)
     AND (NOT COALESCE(p.is_made_to_order, false) OR COALESCE(v.stock_main, 0) > 0)
     AND (v_category IS NULL OR p.category = v_category);
  GET DIAGNOSTICS v_sizes = ROW_COUNT;
  IF v_sizes = 0 THEN
    RAISE EXCEPTION 'STOCK_COUNT_EMPTY';
  END IF;

  RETURN jsonb_build_object('id', v_id, 'number', v_number, 'sizes', v_sizes);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_stock_count(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_stock_count(uuid, text, text) TO authenticated, service_role;

-- 3. Counting: a scan adds one, a typed number sets it, clearing takes it back -----------------
CREATE OR REPLACE FUNCTION public.record_stock_count(
  p_count_id uuid,
  p_variant_id uuid,
  p_mode text,
  p_value integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count public.stock_counts%ROWTYPE;
  v_line public.stock_count_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_count FROM public.stock_counts WHERE id = p_count_id;
  IF NOT FOUND OR NOT public.stock_count_staff(v_count.brand_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF v_count.status <> 'counting' THEN
    RAISE EXCEPTION 'STOCK_COUNT_CLOSED';
  END IF;

  SELECT * INTO v_line FROM public.stock_count_lines
   WHERE count_id = p_count_id AND variant_id = p_variant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_COUNT';
  END IF;

  IF p_mode = 'add' THEN
    IF p_value IS NULL OR p_value NOT BETWEEN -1000 AND 1000 OR COALESCE(v_line.counted, 0) + p_value < 0 THEN
      RAISE EXCEPTION 'INVALID_COUNT';
    END IF;
    v_line.counted := COALESCE(v_line.counted, 0) + p_value;
  ELSIF p_mode = 'set' THEN
    IF p_value IS NULL OR p_value NOT BETWEEN 0 AND 100000 THEN
      RAISE EXCEPTION 'INVALID_COUNT';
    END IF;
    v_line.counted := p_value;
  ELSIF p_mode = 'clear' THEN
    v_line.counted := NULL;
  ELSE
    RAISE EXCEPTION 'INVALID_COUNT';
  END IF;

  UPDATE public.stock_count_lines
     SET counted = v_line.counted,
         counted_at = CASE WHEN v_line.counted IS NULL THEN NULL ELSE now() END,
         counted_by = CASE WHEN v_line.counted IS NULL THEN NULL ELSE auth.uid() END
   WHERE count_id = p_count_id AND variant_id = p_variant_id;

  RETURN jsonb_build_object('variant_id', p_variant_id, 'counted', v_line.counted, 'expected', v_line.expected);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_stock_count(uuid, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_count(uuid, uuid, text, integer) TO authenticated, service_role;

-- 4. What the count found ---------------------------------------------------------------------
-- What moved on a size's shelf since the count started, up to a moment (the ledger's own lines;
-- a stock count's correction is not a move).
CREATE OR REPLACE FUNCTION public.stock_count_moved(p_variant_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(sum(m.delta), 0)::integer
    FROM public.inventory_movements m
   WHERE m.variant_id = p_variant_id
     AND m.location = 'main'
     AND m.created_at > p_from
     AND m.created_at <= p_to
     AND COALESCE(m.reference_type, '') <> 'stock_count';
$$;

REVOKE EXECUTE ON FUNCTION public.stock_count_moved(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

-- Each size of a count with what moved during it and its difference: counted against the stock it
-- had when it was counted. A size not counted has no difference.
CREATE OR REPLACE FUNCTION public.stock_count_review(p_count_id uuid)
RETURNS TABLE (
  variant_id uuid,
  expected integer,
  counted integer,
  moved_during integer,
  difference integer,
  stock_now integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count public.stock_counts%ROWTYPE;
BEGIN
  SELECT * INTO v_count FROM public.stock_counts WHERE id = p_count_id;
  IF NOT FOUND OR NOT public.stock_count_staff(v_count.brand_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF v_count.status = 'applied' THEN
    -- An applied count says what it found and moved then.
    RETURN QUERY
      SELECT l.variant_id, l.expected, l.counted, l.moved_during,
             CASE WHEN l.counted IS NULL THEN NULL ELSE l.counted - l.expected - COALESCE(l.moved_during, 0) END,
             COALESCE(v.stock_main, 0)
        FROM public.stock_count_lines l
        JOIN public.product_variants v ON v.id = l.variant_id
       WHERE l.count_id = p_count_id;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT l.variant_id, l.expected, l.counted,
           public.stock_count_moved(l.variant_id, v_count.started_at, COALESCE(l.counted_at, now())),
           CASE WHEN l.counted IS NULL THEN NULL
                ELSE l.counted - l.expected
                     - public.stock_count_moved(l.variant_id, v_count.started_at, l.counted_at) END,
           COALESCE(v.stock_main, 0)
      FROM public.stock_count_lines l
      JOIN public.product_variants v ON v.id = l.variant_id
     WHERE l.count_id = p_count_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stock_count_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_count_review(uuid) TO authenticated, service_role;

-- 5. Applying it: every difference in one transaction, through the ledger ----------------------
CREATE OR REPLACE FUNCTION public.apply_stock_count(p_count_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count public.stock_counts%ROWTYPE;
  v_line record;
  v_moved integer;
  v_delta integer;
  v_now_stock integer;
  v_changed integer := 0;
  v_pieces integer := 0;
BEGIN
  SELECT * INTO v_count FROM public.stock_counts WHERE id = p_count_id FOR UPDATE;
  IF NOT FOUND OR NOT public.stock_count_staff(v_count.brand_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF v_count.status <> 'counting' THEN
    RAISE EXCEPTION 'STOCK_COUNT_CLOSED';
  END IF;

  FOR v_line IN
    SELECT l.variant_id, l.expected, l.counted, l.counted_at
      FROM public.stock_count_lines l
     WHERE l.count_id = p_count_id AND l.counted IS NOT NULL
     ORDER BY l.variant_id
  LOOP
    v_moved := public.stock_count_moved(v_line.variant_id, v_count.started_at, v_line.counted_at);
    v_delta := v_line.counted - v_line.expected - v_moved;
    -- Never below nothing: a piece an order took from the shelf after it was counted.
    SELECT COALESCE(stock_main, 0) INTO v_now_stock FROM public.product_variants WHERE id = v_line.variant_id;
    IF v_now_stock + v_delta < 0 THEN
      v_delta := -v_now_stock;
    END IF;
    IF v_delta <> 0 THEN
      PERFORM public.apply_inventory_movement(
        p_brand_id => v_count.brand_id,
        p_variant_id => v_line.variant_id,
        p_location => 'main',
        p_delta => v_delta,
        p_reason => 'correction',
        p_reference_type => 'stock_count',
        p_reference_id => v_count.id,
        p_idempotency_key => 'stock_count:' || v_count.id || ':' || v_line.variant_id,
        p_actor_id => auth.uid(),
        p_note => 'SC-' || lpad(v_count.number::text, 4, '0')
      );
      v_changed := v_changed + 1;
      v_pieces := v_pieces + v_delta;
    END IF;
    UPDATE public.stock_count_lines
       SET moved_during = v_moved, applied_delta = v_delta
     WHERE count_id = p_count_id AND variant_id = v_line.variant_id;
  END LOOP;

  UPDATE public.stock_counts
     SET status = 'applied', finished_at = now(), finished_by = auth.uid()
   WHERE id = p_count_id;

  RETURN jsonb_build_object('changed', v_changed, 'pieces', v_pieces);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_stock_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_stock_count(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_stock_count(p_count_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count public.stock_counts%ROWTYPE;
BEGIN
  SELECT * INTO v_count FROM public.stock_counts WHERE id = p_count_id FOR UPDATE;
  IF NOT FOUND OR NOT public.stock_count_staff(v_count.brand_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF v_count.status <> 'counting' THEN
    RAISE EXCEPTION 'STOCK_COUNT_CLOSED';
  END IF;
  UPDATE public.stock_counts
     SET status = 'cancelled', finished_at = now(), finished_by = auth.uid()
   WHERE id = p_count_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_stock_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_stock_count(uuid) TO authenticated, service_role;
