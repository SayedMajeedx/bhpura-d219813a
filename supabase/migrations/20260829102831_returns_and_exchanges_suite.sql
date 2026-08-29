-- Migration: World-Class Returns & Exchanges Suite for Boutq OS
-- Created At: 2026-08-29

-- 1. Brand Return Policies (سياسات الإرجاع والاستبدال لكل علامة تجارية)
CREATE TABLE IF NOT EXISTS public.brand_return_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL UNIQUE REFERENCES public.brands(id) ON DELETE CASCADE,
    return_window_days INTEGER NOT NULL DEFAULT 14,
    allow_partial_returns BOOLEAN NOT NULL DEFAULT true,
    allow_discounted_items BOOLEAN NOT NULL DEFAULT true,
    excluded_category_ids UUID[] DEFAULT '{}',
    excluded_product_ids UUID[] DEFAULT '{}',
    return_shipping_fee NUMERIC(10,3) NOT NULL DEFAULT 0.000,
    customer_shipping_fee_borne_by TEXT NOT NULL DEFAULT 'customer', -- 'customer' or 'brand'
    allowed_compensation_methods TEXT[] NOT NULL DEFAULT ARRAY['refund_original', 'store_credit', 'exchange'],
    require_images BOOLEAN NOT NULL DEFAULT false,
    auto_approve_policy BOOLEAN NOT NULL DEFAULT false,
    policy_terms_ar TEXT,
    policy_terms_en TEXT,
    notify_on_status_change BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Return Requests (طلبات الإرجاع والاستبدال)
CREATE TABLE IF NOT EXISTS public.return_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    return_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    -- 'new', 'under_review', 'approved', 'rejected', 'awaiting_shipment', 'received', 'under_inspection', 'refunded', 'exchanged', 'completed', 'cancelled'
    type TEXT NOT NULL DEFAULT 'return', -- 'return', 'exchange', 'both'
    requested_by TEXT NOT NULL DEFAULT 'customer', -- 'customer' or 'admin'
    requested_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    reason_details TEXT,
    admin_notes TEXT,
    rejection_reason TEXT,
    images TEXT[] DEFAULT '{}',
    pickup_address JSONB,
    tracking_number TEXT,
    courier_name TEXT,
    
    -- Financial breakdown
    preferred_compensation TEXT NOT NULL DEFAULT 'refund_original', -- 'refund_original', 'store_credit', 'exchange'
    total_item_refund NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    pro_rated_discount_deduction NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    tax_refund NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    return_fee NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    net_refund_amount NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    refund_method TEXT, -- 'original_payment', 'store_credit', 'cash', 'bank_transfer'
    refund_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processed', 'failed'
    refund_processed_at TIMESTAMPTZ,
    refund_reference TEXT,
    
    -- Exchange link
    replacement_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    exchange_price_difference NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    exchange_difference_direction TEXT, -- 'customer_pays', 'brand_refunds', 'even'
    exchange_difference_status TEXT DEFAULT 'settled',
    
    -- Timestamps and staff tracking
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    received_at TIMESTAMPTZ,
    received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    inspected_at TIMESTAMPTZ,
    inspected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Return Items (بنود الإرجاع والاستبدال مع الفحص وإعادة المخزون)
CREATE TABLE IF NOT EXISTS public.return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    return_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    total_price NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    reason TEXT,
    item_images TEXT[] DEFAULT '{}',
    action_type TEXT NOT NULL DEFAULT 'return', -- 'return' or 'exchange'
    
    -- Replacement details if exchange
    replacement_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    replacement_variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    replacement_unit_price NUMERIC(12,3) DEFAULT 0.000,
    
    -- Inspection & Quality Control
    condition TEXT NOT NULL DEFAULT 'pending',
    -- 'pending', 'sellable', 'damaged', 'needs_inspection', 'unsellable', 'returned_to_vendor'
    restocked BOOLEAN NOT NULL DEFAULT false,
    restocked_quantity INTEGER NOT NULL DEFAULT 0,
    restocked_at TIMESTAMPTZ,
    restocked_to_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    restocked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    inspection_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Store Credit Ledger (رصيد المتجر للعملاء مع دفتر المعاملات)
CREATE TABLE IF NOT EXISTS public.store_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    return_id UUID REFERENCES public.return_requests(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    amount NUMERIC(12,3) NOT NULL, -- Positive for credit issuance, negative for redemption
    type TEXT NOT NULL, -- 'return_credit', 'manual_adjustment', 'order_redemption', 'refund_reversal'
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Detailed Inventory Movement Logs (سجل حركة المخزون الدقيق قبل وبعد الفحص)
CREATE TABLE IF NOT EXISTS public.inventory_movement_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    return_id UUID REFERENCES public.return_requests(id) ON DELETE SET NULL,
    return_item_id UUID REFERENCES public.return_items(id) ON DELETE SET NULL,
    quantity_before INTEGER NOT NULL,
    quantity_changed INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    movement_type TEXT NOT NULL, -- 'return_restock', 'return_damaged_writeoff', 'exchange_dispatch', 'manual_adjustment'
    item_condition TEXT NOT NULL,
    handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reference_code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Return Notification Outbox (سجل إشعارات المرتجعات المستقل)
CREATE TABLE IF NOT EXISTS public.return_notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    return_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'return_approved', 'return_rejected', 'return_received', 'return_refunded', 'return_exchanged'
    channel TEXT NOT NULL DEFAULT 'email', -- 'email', 'whatsapp', 'push'
    recipient TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    payload JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

-- Indexes for performance & multi-tenant isolation
CREATE INDEX IF NOT EXISTS idx_brand_return_policies_brand_id ON public.brand_return_policies(brand_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_brand_status ON public.return_requests(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_return_requests_order_id ON public.return_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_customer_id ON public.return_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON public.return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_order_item_id ON public.return_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_return_items_variant_id ON public.return_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_store_credits_brand_customer ON public.store_credits(brand_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_logs_brand_variant ON public.inventory_movement_logs(brand_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_return_notification_events_status ON public.return_notification_events(status, created_at);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.update_return_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_brand_return_policies_updated_at ON public.brand_return_policies;
CREATE TRIGGER trg_brand_return_policies_updated_at
BEFORE UPDATE ON public.brand_return_policies
FOR EACH ROW EXECUTE FUNCTION public.update_return_updated_at();

DROP TRIGGER IF EXISTS trg_return_requests_updated_at ON public.return_requests;
CREATE TRIGGER trg_return_requests_updated_at
BEFORE UPDATE ON public.return_requests
FOR EACH ROW EXECUTE FUNCTION public.update_return_updated_at();

-- Cross-brand reference integrity triggers
CREATE OR REPLACE FUNCTION public.enforce_return_request_brand_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order_brand uuid;
BEGIN
  SELECT brand_id INTO v_order_brand FROM public.orders WHERE id = NEW.order_id;
  IF v_order_brand IS NULL OR NEW.brand_id IS DISTINCT FROM v_order_brand THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CROSS_BRAND_RETURN_ORDER_REFERENCE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_return_request_brand_integrity ON public.return_requests;
CREATE TRIGGER trg_enforce_return_request_brand_integrity
BEFORE INSERT OR UPDATE OF brand_id, order_id
ON public.return_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_return_request_brand_integrity();

CREATE OR REPLACE FUNCTION public.enforce_return_item_brand_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_req_brand uuid;
  v_order_item_brand uuid;
BEGIN
  SELECT brand_id INTO v_req_brand FROM public.return_requests WHERE id = NEW.return_id;
  SELECT brand_id INTO v_order_item_brand FROM public.order_items WHERE id = NEW.order_item_id;

  IF v_req_brand IS NULL OR v_order_item_brand IS NULL
     OR NEW.brand_id IS DISTINCT FROM v_req_brand
     OR NEW.brand_id IS DISTINCT FROM v_order_item_brand THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CROSS_BRAND_RETURN_ITEM_REFERENCE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_return_item_brand_integrity ON public.return_items;
CREATE TRIGGER trg_enforce_return_item_brand_integrity
BEFORE INSERT OR UPDATE OF brand_id, return_id, order_item_id
ON public.return_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_return_item_brand_integrity();

-- Enable Row Level Security (RLS)
ALTER TABLE public.brand_return_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movement_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_notification_events ENABLE ROW LEVEL SECURITY;

-- 1. Brand Return Policies RLS
DROP POLICY IF EXISTS "brand_return_policies_admin_access" ON public.brand_return_policies;
CREATE POLICY "brand_return_policies_admin_access"
ON public.brand_return_policies
FOR ALL TO authenticated
USING (
  public.can_access_brand(brand_id)
  AND (public.has_permission('manage_orders') OR public.has_permission('manage_settings'))
)
WITH CHECK (
  public.can_access_brand(brand_id)
  AND (public.has_permission('manage_orders') OR public.has_permission('manage_settings'))
);

DROP POLICY IF EXISTS "brand_return_policies_public_read" ON public.brand_return_policies;
CREATE POLICY "brand_return_policies_public_read"
ON public.brand_return_policies
FOR SELECT TO anon, authenticated
USING (true);

-- 2. Return Requests RLS
DROP POLICY IF EXISTS "return_requests_admin_access" ON public.return_requests;
CREATE POLICY "return_requests_admin_access"
ON public.return_requests
FOR ALL TO authenticated
USING (
  public.can_access_brand(brand_id)
  AND public.has_permission('manage_orders')
)
WITH CHECK (
  public.can_access_brand(brand_id)
  AND public.has_permission('manage_orders')
);

DROP POLICY IF EXISTS "return_requests_customer_select" ON public.return_requests;
CREATE POLICY "return_requests_customer_select"
ON public.return_requests
FOR SELECT TO authenticated
USING (
  customer_id IN (
    SELECT id FROM public.customers WHERE auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "return_requests_customer_insert" ON public.return_requests;
CREATE POLICY "return_requests_customer_insert"
ON public.return_requests
FOR INSERT TO authenticated
WITH CHECK (
  customer_id IN (
    SELECT id FROM public.customers WHERE auth_user_id = auth.uid()
  )
);

-- 3. Return Items RLS
DROP POLICY IF EXISTS "return_items_admin_access" ON public.return_items;
CREATE POLICY "return_items_admin_access"
ON public.return_items
FOR ALL TO authenticated
USING (
  public.can_access_brand(brand_id)
  AND (public.has_permission('manage_orders') OR public.has_permission('manage_inventory'))
)
WITH CHECK (
  public.can_access_brand(brand_id)
  AND (public.has_permission('manage_orders') OR public.has_permission('manage_inventory'))
);

DROP POLICY IF EXISTS "return_items_customer_select" ON public.return_items;
CREATE POLICY "return_items_customer_select"
ON public.return_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.return_requests rr
    JOIN public.customers c ON c.id = rr.customer_id
    WHERE rr.id = return_items.return_id
      AND c.auth_user_id = auth.uid()
  )
);

-- 4. Store Credits RLS
DROP POLICY IF EXISTS "store_credits_admin_access" ON public.store_credits;
CREATE POLICY "store_credits_admin_access"
ON public.store_credits
FOR ALL TO authenticated
USING (
  public.can_access_brand(brand_id)
  AND (public.has_permission('manage_orders') OR public.has_permission('view_financials'))
)
WITH CHECK (
  public.can_access_brand(brand_id)
  AND (public.has_permission('manage_orders') OR public.has_permission('view_financials'))
);

DROP POLICY IF EXISTS "store_credits_customer_select" ON public.store_credits;
CREATE POLICY "store_credits_customer_select"
ON public.store_credits
FOR SELECT TO authenticated
USING (
  customer_id IN (
    SELECT id FROM public.customers WHERE auth_user_id = auth.uid()
  )
);

-- 5. Inventory Movement Logs RLS
DROP POLICY IF EXISTS "inventory_movement_logs_access" ON public.inventory_movement_logs;
CREATE POLICY "inventory_movement_logs_access"
ON public.inventory_movement_logs
FOR ALL TO authenticated
USING (
  public.can_access_brand(brand_id)
  AND (public.has_permission('manage_inventory') OR public.has_permission('manage_orders'))
)
WITH CHECK (
  public.can_access_brand(brand_id)
  AND (public.has_permission('manage_inventory') OR public.has_permission('manage_orders'))
);

-- 6. Return Notification Events RLS
DROP POLICY IF EXISTS "return_notification_events_access" ON public.return_notification_events;
CREATE POLICY "return_notification_events_access"
ON public.return_notification_events
FOR ALL TO authenticated
USING (
  public.can_access_brand(brand_id)
  AND public.has_permission('manage_orders')
)
WITH CHECK (
  public.can_access_brand(brand_id)
  AND public.has_permission('manage_orders')
);


-- =========================================================================
-- ATOMIC STORED PROCEDURES / RPCs
-- =========================================================================

-- RPC 1: Create Return Request (التحقق الصارم وإنشاء المرتجع)
CREATE OR REPLACE FUNCTION public.rpc_create_return_request(
    p_brand_id UUID,
    p_order_id UUID,
    p_requested_by TEXT, -- 'customer' or 'admin'
    p_reason TEXT,
    p_reason_details TEXT,
    p_preferred_compensation TEXT,
    p_items JSONB, -- array of { order_item_id, quantity, action_type, replacement_variant_id, item_reason, item_images }
    p_pickup_address JSONB DEFAULT NULL,
    p_images TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_policy public.brand_return_policies%ROWTYPE;
    v_return_id UUID;
    v_return_seq INT;
    v_return_number TEXT;
    v_item JSONB;
    v_order_item public.order_items%ROWTYPE;
    v_item_qty INT;
    v_already_returned_qty INT;
    v_total_item_refund NUMERIC(12,3) := 0.000;
    v_pro_rated_discount NUMERIC(12,3) := 0.000;
    v_tax_refund NUMERIC(12,3) := 0.000;
    v_return_fee NUMERIC(12,3) := 0.000;
    v_net_refund NUMERIC(12,3) := 0.000;
    v_order_days_old INT;
    v_order_subtotal NUMERIC(12,3);
    v_order_discount NUMERIC(12,3);
    v_discount_ratio NUMERIC(12,6) := 0;
    v_tax_rate NUMERIC(12,6) := 0;
    v_req_type TEXT := 'return';
    v_has_exchange BOOLEAN := false;
    v_has_return BOOLEAN := false;
    v_user_id UUID := auth.uid();
BEGIN
    -- 1. Fetch Order & Authorization Check
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND brand_id = p_brand_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
    END IF;

    IF p_requested_by = 'admin' THEN
        IF NOT public.can_access_brand(p_brand_id) OR NOT public.has_permission('manage_orders') THEN
            RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
        END IF;
    ELSE
        -- Customer request: verify customer ownership
        IF v_order.customer_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.customers c 
                WHERE c.id = v_order.customer_id AND (c.auth_user_id = v_user_id OR v_user_id IS NOT NULL)
            ) AND NOT public.can_access_brand(p_brand_id) THEN
                RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED_CUSTOMER');
            END IF;
        END IF;
    END IF;

    -- 2. Fetch Brand Return Policy
    SELECT * INTO v_policy FROM public.brand_return_policies WHERE brand_id = p_brand_id;
    IF NOT FOUND THEN
        -- Insert default policy if not exists
        INSERT INTO public.brand_return_policies (brand_id) VALUES (p_brand_id) RETURNING * INTO v_policy;
    END IF;

    -- 3. Check Return Window (unless admin override)
    IF p_requested_by != 'admin' THEN
        v_order_days_old := EXTRACT(DAY FROM (NOW() - v_order.created_at))::INT;
        IF v_order_days_old > v_policy.return_window_days THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'RETURN_WINDOW_EXPIRED', 
                'details', format('Order is %s days old, limit is %s days', v_order_days_old, v_policy.return_window_days)
            );
        END IF;
    END IF;

    -- Calculate ratios for pro-rated discount and tax
    v_order_subtotal := COALESCE(v_order.subtotal, 0);
    v_order_discount := COALESCE(v_order.discount, 0);
    IF v_order_subtotal > 0 AND v_order_discount > 0 THEN
        v_discount_ratio := v_order_discount / v_order_subtotal;
    END IF;
    IF COALESCE(v_order.tax_rate, 0) > 0 THEN
        v_tax_rate := v_order.tax_rate / 100.0;
    ELSIF v_order_subtotal > 0 AND COALESCE(v_order.tax_amount, 0) > 0 THEN
        v_tax_rate := v_order.tax_amount / v_order_subtotal;
    END IF;

    -- Return shipping fee
    IF v_policy.customer_shipping_fee_borne_by = 'customer' THEN
        v_return_fee := COALESCE(v_policy.return_shipping_fee, 0);
    END IF;

    -- 4. Generate Sequence Return Number
    SELECT COUNT(*) + 1 INTO v_return_seq 
    FROM public.return_requests 
    WHERE brand_id = p_brand_id;
    
    v_return_number := format('RET-%s-%s', COALESCE(v_order.invoice_number, 1000), LPAD(v_return_seq::TEXT, 2, '0'));

    -- 5. Determine overall return request type
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        IF (v_item->>'action_type') = 'exchange' THEN
            v_has_exchange := true;
        ELSE
            v_has_return := true;
        END IF;
    END LOOP;

    IF v_has_exchange AND v_has_return THEN
        v_req_type := 'both';
    ELSIF v_has_exchange THEN
        v_req_type := 'exchange';
    ELSE
        v_req_type := 'return';
    END IF;

    -- 6. Insert Return Request Header
    INSERT INTO public.return_requests (
        brand_id,
        order_id,
        customer_id,
        return_number,
        status,
        type,
        requested_by,
        requested_by_user_id,
        reason,
        reason_details,
        preferred_compensation,
        images,
        pickup_address,
        return_fee
    ) VALUES (
        p_brand_id,
        p_order_id,
        v_order.customer_id,
        v_return_number,
        CASE WHEN v_policy.auto_approve_policy THEN 'approved' ELSE 'new' END,
        v_req_type,
        p_requested_by,
        v_user_id,
        p_reason,
        p_reason_details,
        p_preferred_compensation,
        p_images,
        p_pickup_address,
        v_return_fee
    ) RETURNING id INTO v_return_id;

    -- 7. Validate and Insert Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_qty := (v_item->>'quantity')::INT;
        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'INVALID_ITEM_QUANTITY';
        END IF;

        -- Fetch order item
        SELECT * INTO v_order_item 
        FROM public.order_items 
        WHERE id = (v_item->>'order_item_id')::UUID 
          AND order_id = p_order_id 
          AND brand_id = p_brand_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND';
        END IF;

        -- Check excluded products or categories if customer request
        IF p_requested_by != 'admin' THEN
            IF v_order_item.product_id = ANY(v_policy.excluded_product_ids) THEN
                RAISE EXCEPTION 'ITEM_EXCLUDED_FROM_RETURN';
            END IF;
            IF NOT v_policy.allow_discounted_items AND v_order_discount > 0 THEN
                RAISE EXCEPTION 'DISCOUNTED_ITEMS_NOT_RETURNABLE';
            END IF;
        END IF;

        -- Calculate already returned/in-progress quantity for this order item
        SELECT COALESCE(SUM(ri.quantity), 0) INTO v_already_returned_qty
        FROM public.return_items ri
        JOIN public.return_requests rr ON rr.id = ri.return_id
        WHERE ri.order_item_id = v_order_item.id
          AND rr.status NOT IN ('cancelled', 'rejected');

        IF (v_already_returned_qty + v_item_qty) > v_order_item.quantity THEN
            RAISE EXCEPTION 'EXCEEDS_PURCHASED_QUANTITY: Purchased %s, Already requested %s, Attempting %s',
                v_order_item.quantity, v_already_returned_qty, v_item_qty;
        END IF;

        -- Accumulate refund totals
        v_total_item_refund := v_total_item_refund + (v_order_item.unit_price * v_item_qty);

        -- Insert return item row
        INSERT INTO public.return_items (
            brand_id,
            return_id,
            order_item_id,
            product_id,
            variant_id,
            quantity,
            unit_price,
            total_price,
            reason,
            action_type,
            replacement_variant_id
        ) VALUES (
            p_brand_id,
            v_return_id,
            v_order_item.id,
            v_order_item.product_id,
            v_order_item.variant_id,
            v_item_qty,
            v_order_item.unit_price,
            v_order_item.unit_price * v_item_qty,
            COALESCE(v_item->>'item_reason', p_reason),
            COALESCE(v_item->>'action_type', 'return'),
            CASE WHEN (v_item->>'replacement_variant_id') IS NOT NULL AND (v_item->>'replacement_variant_id') != ''
                 THEN (v_item->>'replacement_variant_id')::UUID 
                 ELSE NULL END
        );
    END LOOP;

    -- Pro-rated discount calculation
    v_pro_rated_discount := v_total_item_refund * v_discount_ratio;
    v_tax_refund := (v_total_item_refund - v_pro_rated_discount) * v_tax_rate;
    v_net_refund := GREATEST(0, (v_total_item_refund - v_pro_rated_discount + v_tax_refund - v_return_fee));

    -- Update Return Request Financials
    UPDATE public.return_requests
    SET total_item_refund = v_total_item_refund,
        pro_rated_discount_deduction = v_pro_rated_discount,
        tax_refund = v_tax_refund,
        net_refund_amount = v_net_refund
    WHERE id = v_return_id;

    -- Activity Log
    INSERT INTO public.activity_logs (
        brand_id,
        order_id,
        user_id,
        action,
        message_ar,
        message_en,
        metadata
    ) VALUES (
        p_brand_id,
        p_order_id,
        COALESCE(v_user_id, v_order.user_id),
        'return_request_created',
        format('تم إنشاء طلب إرجاع رقم %s بمبلغ %s د.ب', v_return_number, v_net_refund),
        format('Return request %s created for amount %s', v_return_number, v_net_refund),
        jsonb_build_object('return_id', v_return_id, 'return_number', v_return_number, 'net_refund', v_net_refund)
    );

    RETURN jsonb_build_object(
        'success', true,
        'return_id', v_return_id,
        'return_number', v_return_number,
        'net_refund', v_net_refund
    );
END;
$$;


-- RPC 2: Item Inspection & Restock (فحص الجودة وإعادة المخزون الدقيق)
CREATE OR REPLACE FUNCTION public.rpc_inspect_and_restock_return_item(
    p_brand_id UUID,
    p_return_item_id UUID,
    p_condition TEXT, -- 'sellable', 'damaged', 'needs_inspection', 'unsellable', 'returned_to_vendor'
    p_restock_branch_id UUID DEFAULT NULL,
    p_inspection_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item public.return_items%ROWTYPE;
    v_req public.return_requests%ROWTYPE;
    v_variant public.product_variants%ROWTYPE;
    v_qty_before INT := 0;
    v_qty_after INT := 0;
    v_user_id UUID := auth.uid();
    v_all_inspected BOOLEAN := true;
BEGIN
    IF NOT public.can_access_brand(p_brand_id) OR 
       (NOT public.has_permission('manage_inventory') AND NOT public.has_permission('manage_orders')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
    END IF;

    SELECT * INTO v_item FROM public.return_items WHERE id = p_return_item_id AND brand_id = p_brand_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'RETURN_ITEM_NOT_FOUND');
    END IF;

    SELECT * INTO v_req FROM public.return_requests WHERE id = v_item.return_id AND brand_id = p_brand_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'RETURN_REQUEST_NOT_FOUND');
    END IF;

    -- If already restocked, prevent double restocking
    IF v_item.restocked THEN
        RETURN jsonb_build_object('success', false, 'error', 'ITEM_ALREADY_RESTOCKED');
    END IF;

    -- If variant exists, get current stock
    IF v_item.variant_id IS NOT NULL THEN
        SELECT * INTO v_variant FROM public.product_variants WHERE id = v_item.variant_id AND brand_id = p_brand_id;
        v_qty_before := COALESCE(v_variant.stock_quantity, 0);
    END IF;

    -- Only restock if condition is 'sellable'
    IF p_condition = 'sellable' AND v_item.variant_id IS NOT NULL THEN
        v_qty_after := v_qty_before + v_item.quantity;
        
        -- Update variant stock
        UPDATE public.product_variants
        SET stock_quantity = v_qty_after,
            is_active = CASE WHEN v_qty_after > 0 THEN true ELSE is_active END,
            updated_at = NOW()
        WHERE id = v_item.variant_id;

        -- Update product total stock
        IF v_item.product_id IS NOT NULL THEN
            UPDATE public.products
            SET stock_quantity = COALESCE((
                SELECT SUM(stock_quantity) FROM public.product_variants WHERE product_id = v_item.product_id
            ), 0),
            updated_at = NOW()
            WHERE id = v_item.product_id;
        END IF;

        -- Record Detailed Movement Log
        INSERT INTO public.inventory_movement_logs (
            brand_id,
            variant_id,
            branch_id,
            return_id,
            return_item_id,
            quantity_before,
            quantity_changed,
            quantity_after,
            movement_type,
            item_condition,
            handled_by,
            reference_code
        ) VALUES (
            p_brand_id,
            v_item.variant_id,
            p_restock_branch_id,
            v_req.id,
            v_item.id,
            v_qty_before,
            v_item.quantity,
            v_qty_after,
            'return_restock',
            p_condition,
            v_user_id,
            v_req.return_number
        );

        -- Update return item record
        UPDATE public.return_items
        SET condition = p_condition,
            restocked = true,
            restocked_quantity = v_item.quantity,
            restocked_at = NOW(),
            restocked_to_branch_id = p_restock_branch_id,
            restocked_by = v_user_id,
            inspection_notes = p_inspection_notes
        WHERE id = v_item.id;
    ELSE
        -- Non-sellable conditions (damaged, unsellable, returned_to_vendor, needs_inspection)
        v_qty_after := v_qty_before;

        IF v_item.variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movement_logs (
                brand_id,
                variant_id,
                branch_id,
                return_id,
                return_item_id,
                quantity_before,
                quantity_changed,
                quantity_after,
                movement_type,
                item_condition,
                handled_by,
                reference_code
            ) VALUES (
                p_brand_id,
                v_item.variant_id,
                p_restock_branch_id,
                v_req.id,
                v_item.id,
                v_qty_before,
                0,
                v_qty_after,
                CASE WHEN p_condition = 'damaged' THEN 'return_damaged_writeoff' ELSE 'manual_adjustment' END,
                p_condition,
                v_user_id,
                v_req.return_number
            );
        END IF;

        UPDATE public.return_items
        SET condition = p_condition,
            restocked = false,
            restocked_quantity = 0,
            restocked_at = NOW(),
            restocked_to_branch_id = p_restock_branch_id,
            restocked_by = v_user_id,
            inspection_notes = p_inspection_notes
        WHERE id = v_item.id;
    END IF;

    -- Check if all items in the return request have been inspected
    SELECT NOT EXISTS (
        SELECT 1 FROM public.return_items 
        WHERE return_id = v_req.id AND condition = 'pending'
    ) INTO v_all_inspected;

    IF v_all_inspected THEN
        UPDATE public.return_requests
        SET status = 'under_inspection',
            inspected_at = NOW(),
            inspected_by = v_user_id
        WHERE id = v_req.id;
    END IF;

    -- Activity Log
    INSERT INTO public.activity_logs (
        brand_id,
        order_id,
        variant_id,
        user_id,
        action,
        message_ar,
        message_en,
        metadata
    ) VALUES (
        p_brand_id,
        v_req.order_id,
        v_item.variant_id,
        v_user_id,
        'return_item_inspected',
        format('تم فحص البند وتحديد حالته (%s) - إعادة المخزون: %s', p_condition, (p_condition = 'sellable')::TEXT),
        format('Item inspected with condition (%s) - Restocked: %s', p_condition, (p_condition = 'sellable')::TEXT),
        jsonb_build_object(
            'return_item_id', v_item.id, 
            'condition', p_condition, 
            'quantity_before', v_qty_before, 
            'quantity_after', v_qty_after
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'condition', p_condition,
        'restocked', (p_condition = 'sellable'),
        'quantity_before', v_qty_before,
        'quantity_after', v_qty_after
    );
END;
$$;


-- RPC 3: Process Return Refund (تنفيذ الاسترداد المالي ومنع تجاوز المدفوع)
CREATE OR REPLACE FUNCTION public.rpc_process_return_refund(
    p_brand_id UUID,
    p_return_id UUID,
    p_refund_method TEXT, -- 'original_payment', 'store_credit', 'cash', 'bank_transfer'
    p_refund_amount NUMERIC(12,3),
    p_refund_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req public.return_requests%ROWTYPE;
    v_order public.orders%ROWTYPE;
    v_total_paid NUMERIC(12,3);
    v_already_refunded NUMERIC(12,3) := 0.000;
    v_journal_id UUID;
    v_sales_returns_acc UUID;
    v_cash_acc UUID;
    v_user_id UUID := auth.uid();
BEGIN
    IF NOT public.can_access_brand(p_brand_id) OR NOT public.has_permission('manage_orders') THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
    END IF;

    SELECT * INTO v_req FROM public.return_requests WHERE id = p_return_id AND brand_id = p_brand_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'RETURN_REQUEST_NOT_FOUND');
    END IF;

    IF v_req.refund_status = 'processed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'REFUND_ALREADY_PROCESSED');
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = v_req.order_id AND brand_id = p_brand_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
    END IF;

    -- Total paid by customer on the order
    v_total_paid := COALESCE(v_order.advance_paid, 0);
    IF v_order.payment_status = 'paid' AND v_total_paid < v_order.total THEN
        v_total_paid := v_order.total;
    END IF;

    -- Calculate all previously processed refunds on this order
    SELECT COALESCE(SUM(net_refund_amount), 0) INTO v_already_refunded
    FROM public.return_requests
    WHERE order_id = v_order.id
      AND refund_status = 'processed'
      AND id != v_req.id;

    -- Guardrail: Total refunded cannot exceed total paid
    IF (v_already_refunded + p_refund_amount) > v_total_paid THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'REFUND_EXCEEDS_TOTAL_PAID',
            'details', format('Paid: %s, Already refunded: %s, Attempting: %s', v_total_paid, v_already_refunded, p_refund_amount)
        );
    END IF;

    -- If store credit selected, credit the customer wallet
    IF p_refund_method = 'store_credit' THEN
        IF v_order.customer_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_REQUIRED_FOR_STORE_CREDIT');
        END IF;

        INSERT INTO public.store_credits (
            brand_id,
            customer_id,
            return_id,
            order_id,
            amount,
            type,
            notes,
            created_by
        ) VALUES (
            p_brand_id,
            v_order.customer_id,
            v_req.id,
            v_order.id,
            p_refund_amount,
            'return_credit',
            COALESCE(p_notes, format('Store credit for return %s', v_req.return_number)),
            v_user_id
        );
    END IF;

    -- Create Double-Entry Journal Entry for financial ledger
    SELECT id INTO v_sales_returns_acc 
    FROM public.ledger_accounts 
    WHERE brand_id = p_brand_id AND (code = '4100' OR category = 'revenue') 
    LIMIT 1;

    SELECT id INTO v_cash_acc 
    FROM public.ledger_accounts 
    WHERE brand_id = p_brand_id AND (code = '1010' OR category = 'asset') 
    LIMIT 1;

    IF v_sales_returns_acc IS NOT NULL AND v_cash_acc IS NOT NULL THEN
        INSERT INTO public.journal_entries (
            brand_id,
            reference_type,
            reference_id,
            narration
        ) VALUES (
            p_brand_id,
            'order',
            v_req.return_number,
            format('Refund issued for return %s via %s', v_req.return_number, p_refund_method)
        ) RETURNING id INTO v_journal_id;

        INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit)
        VALUES 
            (v_journal_id, v_sales_returns_acc, p_refund_amount, 0),
            (v_journal_id, v_cash_acc, 0, p_refund_amount);
    END IF;

    -- Update Return Request
    UPDATE public.return_requests
    SET status = 'refunded',
        refund_status = 'processed',
        refund_method = p_refund_method,
        net_refund_amount = p_refund_amount,
        refund_reference = p_refund_reference,
        refund_processed_at = NOW(),
        completed_at = CASE WHEN type = 'return' THEN NOW() ELSE completed_at END
    WHERE id = v_req.id;

    -- Activity Log
    INSERT INTO public.activity_logs (
        brand_id,
        order_id,
        user_id,
        action,
        message_ar,
        message_en,
        metadata
    ) VALUES (
        p_brand_id,
        v_order.id,
        v_user_id,
        'return_refund_processed',
        format('تم استرداد مبلغ %s د.ب بنجاح عبر (%s) لطلب الإرجاع %s', p_refund_amount, p_refund_method, v_req.return_number),
        format('Refund of %s successfully processed via (%s) for return %s', p_refund_amount, p_refund_method, v_req.return_number),
        jsonb_build_object('return_id', v_req.id, 'refund_amount', p_refund_amount, 'refund_method', p_refund_method)
    );

    RETURN jsonb_build_object(
        'success', true,
        'return_id', v_req.id,
        'refund_amount', p_refund_amount,
        'refund_method', p_refund_method
    );
END;
$$;


-- RPC 4: Create Exchange Replacement Order (إنشاء طلب الاستبدال المرتبط)
CREATE OR REPLACE FUNCTION public.rpc_create_exchange_replacement_order(
    p_brand_id UUID,
    p_return_id UUID,
    p_replacement_items JSONB -- array of { variant_id, quantity, unit_price, description }
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req public.return_requests%ROWTYPE;
    v_orig_order public.orders%ROWTYPE;
    v_new_order_id UUID;
    v_new_invoice_num INT;
    v_new_subtotal NUMERIC(12,3) := 0.000;
    v_returned_subtotal NUMERIC(12,3);
    v_diff NUMERIC(12,3);
    v_direction TEXT;
    v_item JSONB;
    v_variant public.product_variants%ROWTYPE;
    v_user_id UUID := auth.uid();
BEGIN
    IF NOT public.can_access_brand(p_brand_id) OR NOT public.has_permission('manage_orders') THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
    END IF;

    SELECT * INTO v_req FROM public.return_requests WHERE id = p_return_id AND brand_id = p_brand_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'RETURN_REQUEST_NOT_FOUND');
    END IF;

    SELECT * INTO v_orig_order FROM public.orders WHERE id = v_req.order_id AND brand_id = p_brand_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
    END IF;

    -- Next invoice number
    SELECT COALESCE(MAX(invoice_number), 1000) + 1 INTO v_new_invoice_num
    FROM public.orders
    WHERE brand_id = p_brand_id;

    -- Compute replacement order subtotal
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_replacement_items)
    LOOP
        v_new_subtotal := v_new_subtotal + ((v_item->>'quantity')::INT * (v_item->>'unit_price')::NUMERIC);
    END LOOP;

    v_returned_subtotal := COALESCE(v_req.total_item_refund, 0);
    v_diff := v_new_subtotal - v_returned_subtotal;

    IF v_diff > 0 THEN
        v_direction := 'customer_pays';
    ELSIF v_diff < 0 THEN
        v_direction := 'brand_refunds';
    ELSE
        v_direction := 'even';
    END IF;

    -- Create Replacement Order
    INSERT INTO public.orders (
        brand_id,
        user_id,
        customer_id,
        invoice_number,
        status,
        fulfillment_status,
        payment_status,
        currency,
        subtotal,
        total,
        advance_paid,
        discount,
        shipping,
        notes,
        customer_name_snapshot,
        customer_phone_snapshot,
        customer_email_snapshot,
        delivery_address_snapshot
    ) VALUES (
        p_brand_id,
        COALESCE(v_user_id, v_orig_order.user_id),
        v_orig_order.customer_id,
        v_new_invoice_num,
        'confirmed',
        'PENDING',
        CASE WHEN v_direction = 'customer_pays' THEN 'pending' ELSE 'paid' END,
        v_orig_order.currency,
        v_new_subtotal,
        v_new_subtotal,
        CASE WHEN v_direction = 'customer_pays' THEN 0 ELSE v_new_subtotal END,
        0,
        0,
        format('Exchange replacement order for Return %s (Original Invoice #%s)', v_req.return_number, v_orig_order.invoice_number),
        v_orig_order.customer_name_snapshot,
        v_orig_order.customer_phone_snapshot,
        v_orig_order.customer_email_snapshot,
        v_orig_order.delivery_address_snapshot
    ) RETURNING id INTO v_new_order_id;

    -- Insert Order Items & Deduct Inventory
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_replacement_items)
    LOOP
        SELECT * INTO v_variant FROM public.product_variants WHERE id = (v_item->>'variant_id')::UUID;

        INSERT INTO public.order_items (
            brand_id,
            order_id,
            user_id,
            product_id,
            variant_id,
            description,
            quantity,
            unit_price,
            line_total
        ) VALUES (
            p_brand_id,
            v_new_order_id,
            COALESCE(v_user_id, v_orig_order.user_id),
            v_variant.product_id,
            v_variant.id,
            COALESCE(v_item->>'description', 'Replacement Item'),
            (v_item->>'quantity')::INT,
            (v_item->>'unit_price')::NUMERIC,
            (v_item->>'quantity')::INT * (v_item->>'unit_price')::NUMERIC
        );

        -- Deduct stock for replacement variant
        IF v_variant.id IS NOT NULL THEN
            UPDATE public.product_variants
            SET stock_quantity = GREATEST(0, stock_quantity - (v_item->>'quantity')::INT),
                updated_at = NOW()
            WHERE id = v_variant.id;
        END IF;
    END LOOP;

    -- Update Return Request with Replacement Order Link
    UPDATE public.return_requests
    SET status = 'exchanged',
        replacement_order_id = v_new_order_id,
        exchange_price_difference = ABS(v_diff),
        exchange_difference_direction = v_direction,
        completed_at = NOW()
    WHERE id = v_req.id;

    -- Activity Log
    INSERT INTO public.activity_logs (
        brand_id,
        order_id,
        user_id,
        action,
        message_ar,
        message_en,
        metadata
    ) VALUES (
        p_brand_id,
        v_orig_order.id,
        v_user_id,
        'return_exchange_order_created',
        format('تم إنشاء طلب استبدال بديل رقم #%s لطلب الإرجاع %s (فرق السعر: %s د.ب)', v_new_invoice_num, v_req.return_number, ABS(v_diff)),
        format('Replacement exchange order #%s created for return %s (Price diff: %s)', v_new_invoice_num, v_req.return_number, ABS(v_diff)),
        jsonb_build_object(
            'return_id', v_req.id, 
            'replacement_order_id', v_new_order_id, 
            'invoice_number', v_new_invoice_num, 
            'price_difference', ABS(v_diff), 
            'difference_direction', v_direction
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'replacement_order_id', v_new_order_id,
        'invoice_number', v_new_invoice_num,
        'price_difference', ABS(v_diff),
        'difference_direction', v_direction
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
