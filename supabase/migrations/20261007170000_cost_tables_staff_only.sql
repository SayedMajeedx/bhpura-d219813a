-- Costs get their own staff-only tables (phase 1 of 3).
--
-- A product's cost, packaging cost and supplier, and a variant's cost, sit in the same rows the
-- storefront reads. A visitor was already cut off from those columns (20261007120000), but any
-- signed-in account, a shopper included, can still read every brand's costs, because staff and
-- shoppers share the `authenticated` database role and a column grant cannot tell them apart.
-- A row policy can: costs move to tables whose rows only the brand's own staff can see.
--
--   product_costs  (product_id)  cost_price, direct_packaging_cost, vendor_id
--   variant_costs  (variant_id)  cost_price
--
-- Phase 1 (this migration) adds the tables, fills them from today's columns, and keeps the two
-- sides equal in both directions with triggers, so nothing that reads or writes the old columns
-- (the admin screens, order costing, reports, imports) changes behaviour.
-- Phase 2 moves the application onto the new tables.
-- Phase 3 rewrites the SQL functions that read the old columns, drops the columns, and drops the
-- sync triggers; that is the step that closes the exposure.
--
-- A trigger writes the other side through a transaction-local flag (app.cost_sync), so two
-- triggers never call each other, wherever in the call chain the first write happened.

CREATE TABLE public.product_costs (
  product_id uuid PRIMARY KEY REFERENCES public.products (id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands (id) ON DELETE CASCADE,
  cost_price numeric NOT NULL DEFAULT 0,
  direct_packaging_cost numeric NOT NULL DEFAULT 0.000,
  vendor_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_costs_brand_id_idx ON public.product_costs (brand_id);

CREATE TABLE public.variant_costs (
  variant_id uuid PRIMARY KEY REFERENCES public.product_variants (id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands (id) ON DELETE CASCADE,
  cost_price numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX variant_costs_brand_id_idx ON public.variant_costs (brand_id);

ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variant_costs ENABLE ROW LEVEL SECURITY;

-- The same rule as the catalog's own "brand access" policy, with no public read.
CREATE POLICY "brand access" ON public.product_costs
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id))
  WITH CHECK (public.can_access_brand(brand_id));
CREATE POLICY "brand access" ON public.variant_costs
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id))
  WITH CHECK (public.can_access_brand(brand_id));

REVOKE ALL ON public.product_costs, public.variant_costs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_costs, public.variant_costs
  TO authenticated, service_role;

-- Fill from today's columns.
INSERT INTO public.product_costs (product_id, brand_id, cost_price, direct_packaging_cost, vendor_id)
SELECT id, brand_id, COALESCE(cost_price, 0), COALESCE(direct_packaging_cost, 0), vendor_id
FROM public.products;

INSERT INTO public.variant_costs (variant_id, brand_id, cost_price)
SELECT id, brand_id, COALESCE(cost_price, 0)
FROM public.product_variants;

-- Old columns -> new tables ------------------------------------------------------------------------

CREATE FUNCTION public.sync_product_costs_from_product() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.cost_sync', true) = '1' THEN RETURN NULL; END IF;
  PERFORM set_config('app.cost_sync', '1', true);
  INSERT INTO public.product_costs (product_id, brand_id, cost_price, direct_packaging_cost, vendor_id)
  VALUES (NEW.id, NEW.brand_id, COALESCE(NEW.cost_price, 0), COALESCE(NEW.direct_packaging_cost, 0), NEW.vendor_id)
  ON CONFLICT (product_id) DO UPDATE SET
    brand_id = EXCLUDED.brand_id,
    cost_price = EXCLUDED.cost_price,
    direct_packaging_cost = EXCLUDED.direct_packaging_cost,
    vendor_id = EXCLUDED.vendor_id,
    updated_at = now();
  PERFORM set_config('app.cost_sync', '0', true);
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.sync_variant_costs_from_variant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.cost_sync', true) = '1' THEN RETURN NULL; END IF;
  PERFORM set_config('app.cost_sync', '1', true);
  INSERT INTO public.variant_costs (variant_id, brand_id, cost_price)
  VALUES (NEW.id, NEW.brand_id, COALESCE(NEW.cost_price, 0))
  ON CONFLICT (variant_id) DO UPDATE SET
    brand_id = EXCLUDED.brand_id,
    cost_price = EXCLUDED.cost_price,
    updated_at = now();
  PERFORM set_config('app.cost_sync', '0', true);
  RETURN NULL;
END;
$$;

-- New tables -> old columns ------------------------------------------------------------------------

CREATE FUNCTION public.sync_product_from_product_costs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.cost_sync', true) = '1' THEN RETURN NULL; END IF;
  PERFORM set_config('app.cost_sync', '1', true);
  UPDATE public.products
  SET cost_price = NEW.cost_price,
      direct_packaging_cost = NEW.direct_packaging_cost,
      vendor_id = NEW.vendor_id
  WHERE id = NEW.product_id
    AND brand_id = NEW.brand_id  -- a cost row can only move its own brand's product
    AND (cost_price, direct_packaging_cost, vendor_id)
        IS DISTINCT FROM (NEW.cost_price, NEW.direct_packaging_cost, NEW.vendor_id);
  PERFORM set_config('app.cost_sync', '0', true);
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.sync_variant_from_variant_costs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.cost_sync', true) = '1' THEN RETURN NULL; END IF;
  PERFORM set_config('app.cost_sync', '1', true);
  UPDATE public.product_variants
  SET cost_price = NEW.cost_price
  WHERE id = NEW.variant_id
    AND brand_id = NEW.brand_id  -- a cost row can only move its own brand's variant
    AND cost_price IS DISTINCT FROM NEW.cost_price;
  PERFORM set_config('app.cost_sync', '0', true);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_product_costs_from_product
  AFTER INSERT OR UPDATE OF cost_price, direct_packaging_cost, vendor_id, brand_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_costs_from_product();
CREATE TRIGGER trg_sync_variant_costs_from_variant
  AFTER INSERT OR UPDATE OF cost_price, brand_id ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.sync_variant_costs_from_variant();
CREATE TRIGGER trg_sync_product_from_product_costs
  AFTER INSERT OR UPDATE ON public.product_costs
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_from_product_costs();
CREATE TRIGGER trg_sync_variant_from_variant_costs
  AFTER INSERT OR UPDATE ON public.variant_costs
  FOR EACH ROW EXECUTE FUNCTION public.sync_variant_from_variant_costs();

-- Trigger functions run as the table's own events; nobody calls them through the API.
REVOKE EXECUTE ON FUNCTION public.sync_product_costs_from_product() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_variant_costs_from_variant() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_product_from_product_costs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_variant_from_variant_costs() FROM PUBLIC, anon, authenticated;
