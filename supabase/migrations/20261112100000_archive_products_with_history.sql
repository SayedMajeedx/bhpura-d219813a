-- A product with history is archived, never deleted.
--
-- Deleting a product deletes its sizes with it, and with them their stock ledger, the pieces their
-- orders took and their costs; its order, supplier, booking and return lines are left pointing at
-- nothing. The same rule as a size (migration 20261111100000, the owner's decision of 2026-11-01,
-- extended to products on 2026-11-03): a product that has a history is archived instead, hidden
-- from the store and the inventory and kept for its records; a product with none is still deleted.
-- Pura's "عبايه العيد", received from a supplier and counted out again, could not be deleted, and
-- the inventory said only "Could not delete products".
--
-- * `products.archived_at`: when it was archived; null for a product in use. An archived product
--   is hidden (`is_active` false, held while archived) and only the database writes the column.
-- * `remove_products(ids)`: what the inventory's delete calls. Each product is deleted when it has
--   no history and archived when it has one (`product_has_history`: a size with a history, or an
--   order, supplier, booking or return line naming it). It holds no pieces first
--   (PRODUCT_HAS_STOCK: record them as sold, lost or moved). Staff with `manage_inventory`, as
--   for sizes and stock. It answers which were deleted and which archived, so the screen removes
--   the pictures of the deleted ones only.
-- * `restore_product(id)`: brings an archived product back, still hidden until the merchant
--   shows it.
-- * A direct delete of a product with history is refused (PRODUCT_HAS_HISTORY). Deleting a store,
--   or the database's own functions, are not held back.
-- * A size that gets pieces back (an order cancelled, a return restocked) is in use again, and so
--   is its product (still hidden), so the merchant sees the pieces.
-- * A storefront order line for an archived product is refused (PRODUCT_UNAVAILABLE), beside the
--   archived size's own refusal.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS archived_at timestamptz;
GRANT SELECT (archived_at) ON public.products TO authenticated, anon;

-- ── Whether a product has a history ─────────────────────────────────────────
-- Read by the delete guard as the person deleting, so it answers only for a store they work in.
CREATE OR REPLACE FUNCTION public.product_has_history(p_product_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand uuid;
BEGIN
  SELECT brand_id INTO v_brand FROM public.products WHERE id = p_product_id;
  IF v_brand IS NULL OR NOT public.can_access_brand(v_brand) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
           SELECT 1 FROM public.product_variants v
            WHERE v.product_id = p_product_id AND public.variant_has_history(v.id)
         )
      OR EXISTS (SELECT 1 FROM public.order_items WHERE product_id = p_product_id)
      OR EXISTS (SELECT 1 FROM public.purchase_order_items WHERE product_id = p_product_id)
      OR EXISTS (SELECT 1 FROM public.booking_items WHERE product_id = p_product_id)
      OR EXISTS (
           SELECT 1 FROM public.return_items
            WHERE product_id = p_product_id OR replacement_product_id = p_product_id
         );
END;
$$;

REVOKE ALL ON FUNCTION public.product_has_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_has_history(uuid) TO authenticated;

-- ── A direct delete never takes a history ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.product_delete_keeps_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only a person acting through the API is held to it.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN OLD;
  END IF;
  IF public.product_has_history(OLD.id) THEN
    RAISE EXCEPTION 'PRODUCT_HAS_HISTORY';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.product_delete_keeps_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_products_keep_history ON public.products;
CREATE TRIGGER trg_products_keep_history
  BEFORE DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.product_delete_keeps_history();

-- ── An archived product stays hidden, and only the database archives ────────
CREATE OR REPLACE FUNCTION public.products_archive_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.archived_at := NULL;
    ELSIF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
      RAISE EXCEPTION 'PRODUCT_ARCHIVE_IS_THE_DATABASES';
    END IF;
  END IF;
  IF NEW.archived_at IS NOT NULL THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.products_archive_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_products_archive_rules ON public.products;
CREATE TRIGGER trg_products_archive_rules
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_archive_rules();

-- ── What the inventory's delete calls ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_products(p_product_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_id uuid;
  v_pieces numeric;
  v_deleted uuid[] := '{}';
  v_archived uuid[] := '{}';
BEGIN
  IF p_product_ids IS NULL OR cardinality(p_product_ids) = 0 THEN
    RETURN jsonb_build_object('deleted', '[]'::jsonb, 'archived', '[]'::jsonb);
  END IF;
  IF cardinality(p_product_ids) > 500 THEN
    RAISE EXCEPTION 'TOO_MANY_PRODUCTS';
  END IF;

  FOREACH v_id IN ARRAY (SELECT array_agg(DISTINCT x) FROM unnest(p_product_ids) AS x) LOOP
    SELECT * INTO v_product FROM public.products WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
    END IF;
    IF NOT public.can_access_brand(v_product.brand_id)
       OR NOT public.has_permission('manage_inventory') THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF v_product.archived_at IS NOT NULL THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(sum(GREATEST(COALESCE(stock_main, 0), 0) + GREATEST(COALESCE(stock_incubator, 0), 0)), 0)
      INTO v_pieces
      FROM public.product_variants
     WHERE product_id = v_id AND archived_at IS NULL;
    IF v_pieces > 0 THEN
      RAISE EXCEPTION 'PRODUCT_HAS_STOCK';
    END IF;

    IF public.product_has_history(v_id) THEN
      UPDATE public.products
         SET archived_at = now(), is_active = false, auto_deactivated_out_of_stock = false
       WHERE id = v_id;
      v_archived := array_append(v_archived, v_id);
    ELSE
      DELETE FROM public.products WHERE id = v_id;
      v_deleted := array_append(v_deleted, v_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('deleted', to_jsonb(v_deleted), 'archived', to_jsonb(v_archived));
END;
$$;

REVOKE ALL ON FUNCTION public.remove_products(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_products(uuid[]) TO authenticated;

-- ── Bringing an archived product back ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_product(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand uuid;
BEGIN
  SELECT brand_id INTO v_brand FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;
  IF NOT public.can_access_brand(v_brand) OR NOT public.has_permission('manage_inventory') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  -- Back in the inventory, still hidden from the store until the merchant shows it.
  UPDATE public.products SET archived_at = NULL WHERE id = p_product_id AND archived_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_product(uuid) TO authenticated;

-- ── A size with pieces is in use, and so is its product ─────────────────────
-- The live function (migration 20261111100000), with its product brought back too (still hidden).
-- It runs as the database: pieces come back through the order engine, a return or a supplier,
-- never as the person whose action it was, and only the database writes a product's archive.
CREATE OR REPLACE FUNCTION public.variant_with_pieces_is_in_use()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.stock_main, 0) + COALESCE(NEW.stock_incubator, 0) > 0 THEN
    IF NEW.archived_at IS NOT NULL THEN
      NEW.archived_at := NULL;
    END IF;
    UPDATE public.products SET archived_at = NULL
     WHERE id = NEW.product_id AND archived_at IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.variant_with_pieces_is_in_use() FROM PUBLIC, anon, authenticated;

-- ── An archived product is not ordered on the storefront ─────────────────────
-- The live function (migration 20261111100000), with the product's own archive added.
CREATE OR REPLACE FUNCTION public.refuse_storefront_line_archived_variant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = NEW.order_id AND o.channel = 'storefront'
  ) THEN
    RETURN NEW;
  END IF;
  IF NEW.variant_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.product_variants v
     WHERE v.id = NEW.variant_id AND v.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE:%', NEW.product_id;
  END IF;
  IF NEW.product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE:%', NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;
