-- ==============================================================================
-- Inventory Ledger Schema: movements, allocations, reconciliation, backfill
-- ==============================================================================

-- 1. Table: public.inventory_movements
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  location text NOT NULL CHECK (location IN ('main', 'incubator')),
  delta integer NOT NULL CHECK (delta <> 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  reason text NOT NULL CHECK (reason IN (
    'order_reserve',
    'order_release',
    'order_commit',
    'manual_adjust',
    'return_restock',
    'transfer',
    'import',
    'correction',
    'reconciliation'
  )),
  reference_type text,
  reference_id uuid,
  idempotency_key text NOT NULL,
  actor_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_movements_brand_idempotency
  ON public.inventory_movements (brand_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant_created
  ON public.inventory_movements (variant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_ref
  ON public.inventory_movements (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_brand_location
  ON public.inventory_movements (brand_id, location, created_at DESC);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_movements_select" ON public.inventory_movements;
CREATE POLICY "inventory_movements_select"
  ON public.inventory_movements
  FOR SELECT
  TO authenticated
  USING (public.can_access_brand(brand_id));

REVOKE INSERT, UPDATE, DELETE ON public.inventory_movements FROM authenticated, anon, PUBLIC;
GRANT SELECT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;

-- 2. Table: public.order_inventory_allocations
CREATE TABLE IF NOT EXISTS public.order_inventory_allocations (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  location text NOT NULL CHECK (location IN ('main', 'incubator')),
  quantity integer NOT NULL CHECK (quantity > 0),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, variant_id, location)
);

CREATE INDEX IF NOT EXISTS idx_order_allocations_brand ON public.order_inventory_allocations (brand_id);
CREATE INDEX IF NOT EXISTS idx_order_allocations_variant ON public.order_inventory_allocations (variant_id);

ALTER TABLE public.order_inventory_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_inventory_allocations_select" ON public.order_inventory_allocations;
CREATE POLICY "order_inventory_allocations_select"
  ON public.order_inventory_allocations
  FOR SELECT
  TO authenticated
  USING (public.can_access_brand(brand_id));

REVOKE INSERT, UPDATE, DELETE ON public.order_inventory_allocations FROM authenticated, anon, PUBLIC;
GRANT SELECT ON public.order_inventory_allocations TO authenticated;
GRANT ALL ON public.order_inventory_allocations TO service_role;

-- 3. Add inventory state and revision columns to public.orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_state text NOT NULL DEFAULT 'none'
  CHECK (inventory_state IN ('none', 'reserved', 'committed', 'released'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_revision integer NOT NULL DEFAULT 0;

-- 4. Table: public.inventory_reconciliation_runs
CREATE TABLE IF NOT EXISTS public.inventory_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  variants_checked integer NOT NULL DEFAULT 0,
  drift_count integer NOT NULL DEFAULT 0,
  details jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE public.inventory_reconciliation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_reconciliation_runs_select" ON public.inventory_reconciliation_runs;
CREATE POLICY "inventory_reconciliation_runs_select"
  ON public.inventory_reconciliation_runs
  FOR SELECT
  TO authenticated
  USING (brand_id IS NULL OR public.can_access_brand(brand_id));

REVOKE INSERT, UPDATE, DELETE ON public.inventory_reconciliation_runs FROM authenticated, anon, PUBLIC;
GRANT SELECT ON public.inventory_reconciliation_runs TO authenticated;
GRANT ALL ON public.inventory_reconciliation_runs TO service_role;

-- 5. Non-negative stock constraint on product_variants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_variants_stock_nonnegative'
  ) THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_stock_nonnegative
      CHECK (stock_main >= 0 AND stock_incubator >= 0) NOT VALID;
  END IF;

  -- Validate if no negative rows exist
  IF NOT EXISTS (
    SELECT 1 FROM public.product_variants WHERE stock_main < 0 OR stock_incubator < 0
  ) THEN
    ALTER TABLE public.product_variants VALIDATE CONSTRAINT product_variants_stock_nonnegative;
  END IF;
END $$;

-- 6. Backfill baseline inventory movements for existing variants
INSERT INTO public.inventory_movements (
  brand_id, variant_id, location, delta, balance_after,
  reason, reference_type, reference_id, idempotency_key, note
)
SELECT
  brand_id, id, 'main', stock_main, stock_main,
  'reconciliation', 'system_baseline', NULL,
  'baseline:' || id::text || ':main', 'Initial baseline backfill'
FROM public.product_variants
WHERE stock_main > 0
ON CONFLICT (brand_id, idempotency_key) DO NOTHING;

INSERT INTO public.inventory_movements (
  brand_id, variant_id, location, delta, balance_after,
  reason, reference_type, reference_id, idempotency_key, note
)
SELECT
  brand_id, id, 'incubator', stock_incubator, stock_incubator,
  'reconciliation', 'system_baseline', NULL,
  'baseline:' || id::text || ':incubator', 'Initial baseline backfill'
FROM public.product_variants
WHERE stock_incubator > 0
ON CONFLICT (brand_id, idempotency_key) DO NOTHING;

-- 7. Backfill order allocations and inventory_state for existing orders
DO $$
DECLARE
  v_ord RECORD;
  v_key text;
  v_val text;
  v_var_id uuid;
  v_loc text;
  v_item RECORD;
BEGIN
  FOR v_ord IN
    SELECT id, brand_id, status, stock_deducted, stock_snapshot
    FROM public.orders
    WHERE stock_deducted = true
  LOOP
    IF v_ord.stock_snapshot IS NOT NULL AND v_ord.stock_snapshot <> '{}'::jsonb THEN
      FOR v_key, v_val IN SELECT * FROM jsonb_each_text(v_ord.stock_snapshot)
      LOOP
        IF position('|' IN v_key) > 0 THEN
          v_var_id := split_part(v_key, '|', 1)::uuid;
          v_loc := split_part(v_key, '|', 2);
        ELSE
          v_var_id := v_key::uuid;
          v_loc := 'main';
        END IF;

        IF v_loc NOT IN ('main', 'incubator') THEN
          v_loc := 'main';
        END IF;

        IF v_val::integer > 0 THEN
          INSERT INTO public.order_inventory_allocations (
            order_id, variant_id, location, quantity, brand_id
          ) VALUES (
            v_ord.id, v_var_id, v_loc, v_val::integer, v_ord.brand_id
          ) ON CONFLICT (order_id, variant_id, location) DO NOTHING;
        END IF;
      END LOOP;
    ELSE
      -- Fallback to order_items for older orders
      FOR v_item IN
        SELECT variant_id, COALESCE(location, 'main') AS location, SUM(quantity)::integer AS qty
        FROM public.order_items
        WHERE order_id = v_ord.id AND variant_id IS NOT NULL AND COALESCE(location, 'main') IN ('main', 'incubator')
        GROUP BY variant_id, COALESCE(location, 'main')
      LOOP
        IF v_item.qty > 0 THEN
          INSERT INTO public.order_inventory_allocations (
            order_id, variant_id, location, quantity, brand_id
          ) VALUES (
            v_ord.id, v_item.variant_id, v_item.location, v_item.qty, v_ord.brand_id
          ) ON CONFLICT (order_id, variant_id, location) DO NOTHING;
        END IF;
      END LOOP;
    END IF;

    -- Update inventory_state on order
    UPDATE public.orders
    SET inventory_state = CASE
      WHEN status IN ('completed', 'delivered', 'picked_up') THEN 'committed'
      ELSE 'reserved'
    END
    WHERE id = v_ord.id;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
