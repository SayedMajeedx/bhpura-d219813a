-- Multi-incubator consignment management.
-- Keeps the legacy product_variants.stock_incubator aggregate synchronized while
-- introducing a per-incubator, auditable source of truth.

CREATE TABLE public.incubators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  contact_name text,
  phone text,
  email text,
  commission_type text NOT NULL DEFAULT 'percentage'
    CHECK (commission_type IN ('percentage', 'fixed')),
  commission_value numeric(12,3) NOT NULL DEFAULT 0 CHECK (commission_value >= 0),
  settlement_day smallint CHECK (settlement_day BETWEEN 1 AND 31),
  currency text NOT NULL DEFAULT 'BHD',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);

CREATE TABLE public.incubator_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  incubator_id uuid NOT NULL REFERENCES public.incubators(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  external_code text,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  consignment_price numeric(12,3) NOT NULL DEFAULT 0 CHECK (consignment_price >= 0),
  commission_type text NOT NULL DEFAULT 'percentage'
    CHECK (commission_type IN ('percentage', 'fixed')),
  commission_value numeric(12,3) NOT NULL DEFAULT 0 CHECK (commission_value >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incubator_id, variant_id)
);

CREATE TABLE public.incubator_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  incubator_id uuid NOT NULL REFERENCES public.incubators(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('transfer_in', 'return', 'sale', 'sale_reversal', 'adjustment')),
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  reference_type text,
  reference_id uuid,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.incubator_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  incubator_id uuid NOT NULL REFERENCES public.incubators(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,3) NOT NULL CHECK (unit_price >= 0),
  gross_amount numeric(12,3) NOT NULL CHECK (gross_amount >= 0),
  commission_amount numeric(12,3) NOT NULL CHECK (commission_amount >= 0),
  net_due numeric(12,3) NOT NULL CHECK (net_due >= 0),
  paid_amount numeric(12,3) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  sold_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'reversed')),
  reversal_reason text,
  reversed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  reversed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (paid_amount <= net_due)
);

CREATE TABLE public.incubator_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  incubator_id uuid NOT NULL REFERENCES public.incubators(id) ON DELETE RESTRICT,
  amount numeric(12,3) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT current_date,
  payment_method text,
  reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.incubator_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.incubator_payments(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL REFERENCES public.incubator_sales(id) ON DELETE RESTRICT,
  amount numeric(12,3) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, sale_id)
);

CREATE INDEX incubators_brand_idx ON public.incubators(brand_id, is_active);
CREATE INDEX incubator_inventory_brand_incubator_idx ON public.incubator_inventory(brand_id, incubator_id);
CREATE INDEX incubator_inventory_variant_idx ON public.incubator_inventory(variant_id);
CREATE UNIQUE INDEX incubator_inventory_external_code_uniq
  ON public.incubator_inventory(incubator_id, external_code)
  WHERE external_code IS NOT NULL;
CREATE INDEX incubator_movements_incubator_date_idx ON public.incubator_movements(incubator_id, occurred_at DESC);
CREATE INDEX incubator_sales_incubator_date_idx ON public.incubator_sales(incubator_id, sold_at DESC);
CREATE INDEX incubator_sales_unpaid_idx ON public.incubator_sales(incubator_id, status, paid_amount) WHERE status = 'confirmed';
CREATE INDEX incubator_payments_incubator_date_idx ON public.incubator_payments(incubator_id, payment_date DESC);

CREATE TRIGGER incubators_updated_at BEFORE UPDATE ON public.incubators
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER incubator_inventory_updated_at BEFORE UPDATE ON public.incubator_inventory
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.incubators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incubator_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incubator_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incubator_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incubator_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incubator_payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand incubators access" ON public.incubators FOR ALL TO authenticated
USING (public.can_access_brand(brand_id) AND public.has_permission('manage_inventory'))
WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_inventory'));
CREATE POLICY "brand incubator inventory access" ON public.incubator_inventory FOR SELECT TO authenticated
USING (public.can_access_brand(brand_id) AND public.has_permission('manage_inventory'));
CREATE POLICY "brand incubator movements access" ON public.incubator_movements FOR SELECT TO authenticated
USING (public.can_access_brand(brand_id) AND public.has_permission('manage_inventory'));
CREATE POLICY "brand incubator sales access" ON public.incubator_sales FOR SELECT TO authenticated
USING (public.can_access_brand(brand_id) AND public.has_permission('manage_inventory'));
CREATE POLICY "brand incubator payments access" ON public.incubator_payments FOR SELECT TO authenticated
USING (public.can_access_brand(brand_id) AND public.has_permission('manage_inventory'));
CREATE POLICY "brand incubator allocations access" ON public.incubator_payment_allocations FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.incubator_payments p
  WHERE p.id = payment_id AND public.can_access_brand(p.brand_id)
    AND public.has_permission('manage_inventory')
));

-- Block inconsistent cross-brand references even for privileged callers.
CREATE OR REPLACE FUNCTION public.enforce_incubator_reference_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_inc_brand uuid; v_variant_brand uuid;
BEGIN
  SELECT brand_id INTO v_inc_brand FROM public.incubators WHERE id = NEW.incubator_id;
  IF TG_TABLE_NAME IN ('incubator_inventory', 'incubator_movements', 'incubator_sales') THEN
    SELECT p.brand_id INTO v_variant_brand
    FROM public.product_variants v JOIN public.products p ON p.id = v.product_id
    WHERE v.id = NEW.variant_id;
  ELSE
    v_variant_brand := NEW.brand_id;
  END IF;
  IF v_inc_brand IS NULL OR v_variant_brand IS NULL
     OR NEW.brand_id IS DISTINCT FROM v_inc_brand
     OR NEW.brand_id IS DISTINCT FROM v_variant_brand THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CROSS_BRAND_INCUBATOR_REFERENCE';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER incubator_inventory_integrity BEFORE INSERT OR UPDATE ON public.incubator_inventory
FOR EACH ROW EXECUTE FUNCTION public.enforce_incubator_reference_integrity();
CREATE TRIGGER incubator_movements_integrity BEFORE INSERT OR UPDATE ON public.incubator_movements
FOR EACH ROW EXECUTE FUNCTION public.enforce_incubator_reference_integrity();
CREATE TRIGGER incubator_sales_integrity BEFORE INSERT OR UPDATE ON public.incubator_sales
FOR EACH ROW EXECUTE FUNCTION public.enforce_incubator_reference_integrity();
CREATE TRIGGER incubator_payments_integrity BEFORE INSERT OR UPDATE ON public.incubator_payments
FOR EACH ROW EXECUTE FUNCTION public.enforce_incubator_reference_integrity();

-- Transfer physical units from main stock to one incubator.
CREATE OR REPLACE FUNCTION public.transfer_stock_to_incubator(
  p_incubator_id uuid, p_variant_id uuid, p_quantity integer,
  p_external_code text DEFAULT NULL, p_price numeric DEFAULT NULL,
  p_commission_type text DEFAULT NULL, p_commission_value numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_brand uuid; v_variant_brand uuid; v_inventory_id uuid; v_inc public.incubators%ROWTYPE;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  SELECT * INTO v_inc FROM public.incubators WHERE id = p_incubator_id AND is_active FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_brand(v_inc.brand_id) OR NOT public.has_permission('manage_inventory') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  SELECT p.brand_id INTO v_variant_brand FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id WHERE v.id = p_variant_id;
  IF v_variant_brand IS DISTINCT FROM v_inc.brand_id THEN RAISE EXCEPTION 'CROSS_BRAND_INCUBATOR_REFERENCE'; END IF;
  UPDATE public.product_variants SET stock_main = stock_main - p_quantity,
    stock_incubator = stock_incubator + p_quantity
  WHERE id = p_variant_id AND stock_main >= p_quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_MAIN_STOCK'; END IF;
  INSERT INTO public.incubator_inventory
    (brand_id, incubator_id, variant_id, external_code, quantity, consignment_price, commission_type, commission_value)
  VALUES (v_inc.brand_id, p_incubator_id, p_variant_id, nullif(trim(p_external_code), ''), p_quantity,
    COALESCE(p_price, 0), COALESCE(p_commission_type, v_inc.commission_type),
    COALESCE(p_commission_value, v_inc.commission_value))
  ON CONFLICT (incubator_id, variant_id) DO UPDATE SET
    quantity = incubator_inventory.quantity + EXCLUDED.quantity,
    external_code = COALESCE(EXCLUDED.external_code, incubator_inventory.external_code),
    consignment_price = CASE WHEN EXCLUDED.consignment_price > 0 THEN EXCLUDED.consignment_price ELSE incubator_inventory.consignment_price END,
    commission_type = EXCLUDED.commission_type, commission_value = EXCLUDED.commission_value
  RETURNING id INTO v_inventory_id;
  INSERT INTO public.incubator_movements(brand_id, incubator_id, variant_id, movement_type, quantity_delta, notes)
  VALUES (v_inc.brand_id, p_incubator_id, p_variant_id, 'transfer_in', p_quantity, p_notes);
  RETURN v_inventory_id;
END; $$;

CREATE OR REPLACE FUNCTION public.return_stock_from_incubator(
  p_incubator_id uuid, p_variant_id uuid, p_quantity integer, p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_brand uuid;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  SELECT brand_id INTO v_brand FROM public.incubators WHERE id = p_incubator_id FOR UPDATE;
  IF v_brand IS NULL OR NOT public.can_access_brand(v_brand) OR NOT public.has_permission('manage_inventory') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  UPDATE public.incubator_inventory SET quantity = quantity - p_quantity
  WHERE incubator_id = p_incubator_id AND variant_id = p_variant_id AND quantity >= p_quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_INCUBATOR_STOCK'; END IF;
  UPDATE public.product_variants SET stock_incubator = stock_incubator - p_quantity, stock_main = stock_main + p_quantity
  WHERE id = p_variant_id AND stock_incubator >= p_quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'INCUBATOR_STOCK_OUT_OF_SYNC'; END IF;
  INSERT INTO public.incubator_movements(brand_id, incubator_id, variant_id, movement_type, quantity_delta, notes)
  VALUES (v_brand, p_incubator_id, p_variant_id, 'return', -p_quantity, p_notes);
END; $$;

CREATE OR REPLACE FUNCTION public.record_incubator_sale(
  p_incubator_id uuid, p_variant_id uuid, p_quantity integer,
  p_unit_price numeric DEFAULT NULL, p_sold_at timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_brand uuid; v_item public.incubator_inventory%ROWTYPE; v_gross numeric(12,3);
  v_commission numeric(12,3); v_net numeric(12,3); v_sale_id uuid;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  SELECT brand_id INTO v_brand FROM public.incubators WHERE id = p_incubator_id FOR UPDATE;
  IF v_brand IS NULL OR NOT public.can_access_brand(v_brand) OR NOT public.has_permission('manage_inventory') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  SELECT * INTO v_item FROM public.incubator_inventory
  WHERE incubator_id = p_incubator_id AND variant_id = p_variant_id FOR UPDATE;
  IF NOT FOUND OR v_item.quantity < p_quantity THEN RAISE EXCEPTION 'INSUFFICIENT_INCUBATOR_STOCK'; END IF;
  v_gross := round(COALESCE(p_unit_price, v_item.consignment_price) * p_quantity, 3);
  v_commission := CASE WHEN v_item.commission_type = 'percentage'
    THEN round(v_gross * v_item.commission_value / 100, 3)
    ELSE round(v_item.commission_value * p_quantity, 3) END;
  v_commission := least(v_commission, v_gross); v_net := v_gross - v_commission;
  UPDATE public.incubator_inventory SET quantity = quantity - p_quantity WHERE id = v_item.id;
  UPDATE public.product_variants SET stock_incubator = stock_incubator - p_quantity
  WHERE id = p_variant_id AND stock_incubator >= p_quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'INCUBATOR_STOCK_OUT_OF_SYNC'; END IF;
  INSERT INTO public.incubator_sales(brand_id, incubator_id, variant_id, quantity, unit_price,
    gross_amount, commission_amount, net_due, sold_at)
  VALUES (v_brand, p_incubator_id, p_variant_id, p_quantity,
    COALESCE(p_unit_price, v_item.consignment_price), v_gross, v_commission, v_net, p_sold_at)
  RETURNING id INTO v_sale_id;
  INSERT INTO public.incubator_movements(brand_id, incubator_id, variant_id, movement_type,
    quantity_delta, reference_type, reference_id)
  VALUES (v_brand, p_incubator_id, p_variant_id, 'sale', -p_quantity, 'sale', v_sale_id);
  RETURN v_sale_id;
END; $$;

CREATE OR REPLACE FUNCTION public.reverse_incubator_sale(p_sale_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sale public.incubator_sales%ROWTYPE;
BEGIN
  SELECT * INTO v_sale FROM public.incubator_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_brand(v_sale.brand_id) OR NOT public.has_permission('manage_inventory') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  IF v_sale.status <> 'confirmed' THEN RAISE EXCEPTION 'SALE_ALREADY_REVERSED'; END IF;
  IF v_sale.paid_amount > 0 THEN RAISE EXCEPTION 'PAID_SALE_CANNOT_BE_REVERSED'; END IF;
  UPDATE public.incubator_sales SET status = 'reversed', reversal_reason = nullif(trim(p_reason), ''),
    reversed_at = now(), reversed_by = auth.uid() WHERE id = p_sale_id;
  UPDATE public.incubator_inventory SET quantity = quantity + v_sale.quantity
  WHERE incubator_id = v_sale.incubator_id AND variant_id = v_sale.variant_id;
  UPDATE public.product_variants SET stock_incubator = stock_incubator + v_sale.quantity WHERE id = v_sale.variant_id;
  INSERT INTO public.incubator_movements(brand_id, incubator_id, variant_id, movement_type,
    quantity_delta, reference_type, reference_id, notes)
  VALUES (v_sale.brand_id, v_sale.incubator_id, v_sale.variant_id, 'sale_reversal',
    v_sale.quantity, 'sale', p_sale_id, p_reason);
END; $$;

-- Records a payment and allocates it oldest-sale-first. Overpayments are rejected.
CREATE OR REPLACE FUNCTION public.record_incubator_payment(
  p_incubator_id uuid, p_amount numeric, p_payment_date date DEFAULT current_date,
  p_payment_method text DEFAULT NULL, p_reference text DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_brand uuid; v_payment_id uuid; v_remaining numeric(12,3); v_apply numeric(12,3); r record;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT'; END IF;
  SELECT brand_id INTO v_brand FROM public.incubators WHERE id = p_incubator_id FOR UPDATE;
  IF v_brand IS NULL OR NOT public.can_access_brand(v_brand) OR NOT public.has_permission('manage_inventory') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  IF p_amount > COALESCE((SELECT sum(net_due - paid_amount) FROM public.incubator_sales
      WHERE incubator_id = p_incubator_id AND status = 'confirmed'), 0) THEN
    RAISE EXCEPTION 'PAYMENT_EXCEEDS_AMOUNT_DUE';
  END IF;
  INSERT INTO public.incubator_payments(brand_id, incubator_id, amount, payment_date, payment_method, reference, notes)
  VALUES (v_brand, p_incubator_id, p_amount, p_payment_date, nullif(trim(p_payment_method), ''),
    nullif(trim(p_reference), ''), p_notes) RETURNING id INTO v_payment_id;
  v_remaining := p_amount;
  FOR r IN SELECT id, net_due - paid_amount AS due FROM public.incubator_sales
    WHERE incubator_id = p_incubator_id AND status = 'confirmed' AND paid_amount < net_due
    ORDER BY sold_at, created_at FOR UPDATE LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := least(v_remaining, r.due);
    UPDATE public.incubator_sales SET paid_amount = paid_amount + v_apply WHERE id = r.id;
    INSERT INTO public.incubator_payment_allocations(payment_id, sale_id, amount)
    VALUES (v_payment_id, r.id, v_apply);
    v_remaining := v_remaining - v_apply;
  END LOOP;
  RETURN v_payment_id;
END; $$;

-- Adopt legacy undifferentiated incubator quantities into one clearly-labelled account per brand.
DO $$
DECLARE r record; v_incubator_id uuid;
BEGIN
  FOR r IN SELECT DISTINCT p.brand_id FROM public.product_variants v
    JOIN public.products p ON p.id = v.product_id WHERE v.stock_incubator > 0 LOOP
    INSERT INTO public.incubators(brand_id, name, notes)
    VALUES (r.brand_id, 'الحاضنة القديمة', 'تم إنشاؤها تلقائياً لترحيل كميات الحاضنة السابقة')
    ON CONFLICT (brand_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_incubator_id;
    INSERT INTO public.incubator_inventory(brand_id, incubator_id, variant_id, quantity, consignment_price,
      commission_type, commission_value)
    SELECT r.brand_id, v_incubator_id, v.id, v.stock_incubator, COALESCE(v.selling_price, 0), 'percentage', 0
    FROM public.product_variants v JOIN public.products p ON p.id = v.product_id
    WHERE p.brand_id = r.brand_id AND v.stock_incubator > 0
    ON CONFLICT (incubator_id, variant_id) DO UPDATE SET quantity = EXCLUDED.quantity;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.enforce_incubator_reference_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transfer_stock_to_incubator(uuid,uuid,integer,text,numeric,text,numeric,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.return_stock_from_incubator(uuid,uuid,integer,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_incubator_sale(uuid,uuid,integer,numeric,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_incubator_sale(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_incubator_payment(uuid,numeric,date,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_stock_to_incubator(uuid,uuid,integer,text,numeric,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_stock_from_incubator(uuid,uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_incubator_sale(uuid,uuid,integer,numeric,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_incubator_sale(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_incubator_payment(uuid,numeric,date,text,text,text) TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.incubators TO authenticated;
GRANT SELECT ON public.incubator_inventory, public.incubator_movements, public.incubator_sales,
  public.incubator_payments, public.incubator_payment_allocations TO authenticated;

NOTIFY pgrst, 'reload schema';
