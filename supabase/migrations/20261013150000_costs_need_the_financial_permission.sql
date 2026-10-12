-- What a store pays for its products is read and changed only by staff who may see its finances.
--
-- A member of staff is given permissions one by one: managing the stock is one, seeing the
-- store's finances (`view_financials`) is another. The expenses, the suppliers and the purchase
-- orders already ask for the second. A product's and a variant's cost did not: `product_costs`
-- and `variant_costs` were open to any member of the store's staff, so a stock clerk who is not
-- shown a cost on any screen could still read every one of them.
--
-- 1. The two cost tables ask for the permission, like the other financial tables.
--
-- 2. The cost columns on `products` and `product_variants` are still what the forms write (a
--    trigger copies them across). A clerk's form cannot read the costs, so it holds zeros, and
--    saving it would write those zeros over the real costs. The database now keeps the costs as
--    they are when the writer may not see them: the rest of the save goes through, the cost
--    columns do not move. A new product made by such a writer starts with no cost; a new variant
--    takes its product's cost as before.
--
-- Nothing changes for an admin, a store owner, the platform's owner (they hold every
-- permission), the server, or the database's own functions.

-- ── Who may see a store's costs ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_view_brand_costs(_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_brand(_brand_id) AND public.has_permission('view_financials');
$$;

REVOKE ALL ON FUNCTION public.can_view_brand_costs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_brand_costs(uuid) TO authenticated, service_role;

-- ── The cost tables ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "brand access" ON public.product_costs;
DROP POLICY IF EXISTS "staff who see finances" ON public.product_costs;
CREATE POLICY "staff who see finances" ON public.product_costs
  FOR ALL TO authenticated
  USING (public.can_view_brand_costs(brand_id))
  WITH CHECK (public.can_view_brand_costs(brand_id));

DROP POLICY IF EXISTS "brand access" ON public.variant_costs;
DROP POLICY IF EXISTS "staff who see finances" ON public.variant_costs;
CREATE POLICY "staff who see finances" ON public.variant_costs
  FOR ALL TO authenticated
  USING (public.can_view_brand_costs(brand_id))
  WITH CHECK (public.can_view_brand_costs(brand_id));

-- ── The cost columns the forms write ────────────────────────────────────────
-- Runs as the writer, so `current_user` says who is writing: a person's browser session is
-- `authenticated`; the server and the database's own functions are not, and are left alone.
CREATE OR REPLACE FUNCTION public.keep_product_costs_from_unpermitted_writer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.can_view_brand_costs(NEW.brand_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.cost_price := OLD.cost_price;
    NEW.direct_packaging_cost := OLD.direct_packaging_cost;
    NEW.vendor_id := OLD.vendor_id;
  ELSE
    NEW.cost_price := 0;
    NEW.direct_packaging_cost := 0;
    NEW.vendor_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.keep_variant_cost_from_unpermitted_writer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.can_view_brand_costs(NEW.brand_id) THEN
    RETURN NEW;
  END IF;
  NEW.cost_price := OLD.cost_price;
  RETURN NEW;
END;
$$;

-- Named to run after the triggers that fill a new row's brand (`trg_products_default_brand`,
-- `trg_product_variants_default_brand`): BEFORE triggers run in the order of their names.
DROP TRIGGER IF EXISTS trg_products_keep_costs ON public.products;
CREATE TRIGGER trg_products_keep_costs
  BEFORE INSERT OR UPDATE OF cost_price, direct_packaging_cost, vendor_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.keep_product_costs_from_unpermitted_writer();

-- A new variant always takes its product's cost (`inherit_product_variant_pricing`), so only a
-- change needs the guard.
DROP TRIGGER IF EXISTS trg_product_variants_keep_cost ON public.product_variants;
CREATE TRIGGER trg_product_variants_keep_cost
  BEFORE UPDATE OF cost_price ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.keep_variant_cost_from_unpermitted_writer();
