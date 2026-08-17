-- Close the cross-tenant access introduced by the accounting suite migration.
-- Every policy below requires both brand membership and the feature permission.
-- Child rows without brand_id derive access from their secured parent row.

ALTER TABLE public.packaging_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_bom_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flow_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Packaging Materials Access" ON public.packaging_materials;
DROP POLICY IF EXISTS "Tenant BOM Items Access" ON public.product_bom_items;
DROP POLICY IF EXISTS "Tenant Vendors Access" ON public.vendors;
DROP POLICY IF EXISTS "Tenant Cash Accounts Access" ON public.cash_flow_accounts;
DROP POLICY IF EXISTS "Tenant Transactions Access" ON public.account_transactions;
DROP POLICY IF EXISTS "Tenant PO Access" ON public.purchase_orders;
DROP POLICY IF EXISTS "Tenant PO Items Access" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Tenant Ledger Accounts Access" ON public.ledger_accounts;
DROP POLICY IF EXISTS "Tenant Journal Entries Access" ON public.journal_entries;
DROP POLICY IF EXISTS "Tenant Journal Entry Lines Access" ON public.journal_entry_lines;

CREATE POLICY "brand inventory packaging access"
ON public.packaging_materials
FOR ALL TO authenticated
USING (
  public.can_access_brand(brand_id)
  AND public.has_permission('manage_inventory')
)
WITH CHECK (
  public.can_access_brand(brand_id)
  AND public.has_permission('manage_inventory')
);

CREATE POLICY "brand inventory bom access"
ON public.product_bom_items
FOR ALL TO authenticated
USING (
  public.can_access_brand(brand_id)
  AND public.has_permission('manage_inventory')
)
WITH CHECK (
  public.can_access_brand(brand_id)
  AND public.has_permission('manage_inventory')
);

CREATE POLICY "brand financial vendors access"
ON public.vendors
FOR ALL TO authenticated
USING (
  public.can_access_brand(brand_id)
  AND public.has_permission('view_financials')
)
WITH CHECK (
  public.can_access_brand(brand_id)
  AND public.has_permission('view_financials')
);

CREATE POLICY "brand financial cash accounts access"
ON public.cash_flow_accounts
FOR ALL TO authenticated
USING (
  public.can_access_brand(brand_id)
  AND public.has_permission('view_financials')
)
WITH CHECK (
  public.can_access_brand(brand_id)
  AND public.has_permission('view_financials')
);

CREATE POLICY "brand financial transactions access"
ON public.account_transactions
FOR ALL TO authenticated
USING (
  public.can_access_brand(brand_id)
  AND public.has_permission('view_financials')
)
WITH CHECK (
  public.can_access_brand(brand_id)
  AND public.has_permission('view_financials')
);

CREATE POLICY "brand financial purchase orders access"
ON public.purchase_orders
FOR ALL TO authenticated
USING (
  public.can_access_brand(brand_id)
  AND public.has_permission('view_financials')
)
WITH CHECK (
  public.can_access_brand(brand_id)
  AND public.has_permission('view_financials')
);

CREATE POLICY "brand financial purchase order items access"
ON public.purchase_order_items
FOR ALL TO authenticated
USING (
  public.has_permission('view_financials')
  AND EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.po_id
      AND public.can_access_brand(po.brand_id)
  )
)
WITH CHECK (
  public.has_permission('view_financials')
  AND EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.po_id
      AND public.can_access_brand(po.brand_id)
  )
);

CREATE POLICY "brand financial ledger accounts access"
ON public.ledger_accounts
FOR ALL TO authenticated
USING (
  public.can_access_brand(brand_id)
  AND public.has_permission('view_financials')
)
WITH CHECK (
  public.can_access_brand(brand_id)
  AND public.has_permission('view_financials')
);

CREATE POLICY "brand financial journal entries access"
ON public.journal_entries
FOR ALL TO authenticated
USING (
  public.can_access_brand(brand_id)
  AND public.has_permission('view_financials')
)
WITH CHECK (
  public.can_access_brand(brand_id)
  AND public.has_permission('view_financials')
);

CREATE POLICY "brand financial journal lines access"
ON public.journal_entry_lines
FOR ALL TO authenticated
USING (
  public.has_permission('view_financials')
  AND EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.id = journal_entry_lines.entry_id
      AND public.can_access_brand(je.brand_id)
  )
)
WITH CHECK (
  public.has_permission('view_financials')
  AND EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.id = journal_entry_lines.entry_id
      AND public.can_access_brand(je.brand_id)
  )
);

-- RLS stops tenant users from reaching another brand. These triggers additionally
-- prevent internally inconsistent cross-brand references from privileged jobs.

CREATE OR REPLACE FUNCTION public.enforce_product_bom_brand_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_product_brand uuid;
  v_material_brand uuid;
BEGIN
  SELECT brand_id INTO v_product_brand FROM public.products WHERE id = NEW.product_id;
  SELECT brand_id INTO v_material_brand FROM public.packaging_materials WHERE id = NEW.packaging_material_id;

  IF v_product_brand IS NULL OR v_material_brand IS NULL
     OR NEW.brand_id IS DISTINCT FROM v_product_brand
     OR NEW.brand_id IS DISTINCT FROM v_material_brand THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CROSS_BRAND_BOM_REFERENCE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_product_bom_brand_integrity ON public.product_bom_items;
CREATE TRIGGER enforce_product_bom_brand_integrity
BEFORE INSERT OR UPDATE OF brand_id, product_id, packaging_material_id
ON public.product_bom_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_product_bom_brand_integrity();

CREATE OR REPLACE FUNCTION public.enforce_account_transaction_brand_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_account_brand uuid;
BEGIN
  IF NEW.source_account_id IS NOT NULL THEN
    SELECT brand_id INTO v_account_brand FROM public.cash_flow_accounts WHERE id = NEW.source_account_id;
    IF v_account_brand IS NULL OR NEW.brand_id IS DISTINCT FROM v_account_brand THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CROSS_BRAND_SOURCE_ACCOUNT';
    END IF;
  END IF;

  IF NEW.target_account_id IS NOT NULL THEN
    v_account_brand := NULL;
    SELECT brand_id INTO v_account_brand FROM public.cash_flow_accounts WHERE id = NEW.target_account_id;
    IF v_account_brand IS NULL OR NEW.brand_id IS DISTINCT FROM v_account_brand THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CROSS_BRAND_TARGET_ACCOUNT';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_account_transaction_brand_integrity ON public.account_transactions;
CREATE TRIGGER enforce_account_transaction_brand_integrity
BEFORE INSERT OR UPDATE OF brand_id, source_account_id, target_account_id
ON public.account_transactions
FOR EACH ROW EXECUTE FUNCTION public.enforce_account_transaction_brand_integrity();

CREATE OR REPLACE FUNCTION public.enforce_purchase_order_brand_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_vendor_brand uuid;
BEGIN
  SELECT brand_id INTO v_vendor_brand FROM public.vendors WHERE id = NEW.vendor_id;
  IF v_vendor_brand IS NULL OR NEW.brand_id IS DISTINCT FROM v_vendor_brand THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CROSS_BRAND_PURCHASE_ORDER_VENDOR';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_purchase_order_brand_integrity ON public.purchase_orders;
CREATE TRIGGER enforce_purchase_order_brand_integrity
BEFORE INSERT OR UPDATE OF brand_id, vendor_id
ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_purchase_order_brand_integrity();

CREATE OR REPLACE FUNCTION public.enforce_expense_vendor_brand_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_vendor_brand uuid;
BEGIN
  IF NEW.vendor_id IS NOT NULL THEN
    SELECT brand_id INTO v_vendor_brand FROM public.vendors WHERE id = NEW.vendor_id;
    IF v_vendor_brand IS NULL OR NEW.brand_id IS DISTINCT FROM v_vendor_brand THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CROSS_BRAND_EXPENSE_VENDOR';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_expense_vendor_brand_integrity ON public.expenses;
CREATE TRIGGER enforce_expense_vendor_brand_integrity
BEFORE INSERT OR UPDATE OF brand_id, vendor_id
ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.enforce_expense_vendor_brand_integrity();

CREATE OR REPLACE FUNCTION public.enforce_journal_line_brand_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_entry_brand uuid;
  v_account_brand uuid;
BEGIN
  SELECT brand_id INTO v_entry_brand FROM public.journal_entries WHERE id = NEW.entry_id;
  SELECT brand_id INTO v_account_brand FROM public.ledger_accounts WHERE id = NEW.account_id;
  IF v_entry_brand IS NULL OR v_account_brand IS NULL OR v_entry_brand IS DISTINCT FROM v_account_brand THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CROSS_BRAND_JOURNAL_LINE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_journal_line_brand_integrity ON public.journal_entry_lines;
CREATE TRIGGER enforce_journal_line_brand_integrity
BEFORE INSERT OR UPDATE OF entry_id, account_id
ON public.journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION public.enforce_journal_line_brand_integrity();

REVOKE ALL ON FUNCTION public.enforce_product_bom_brand_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_account_transaction_brand_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_purchase_order_brand_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_expense_vendor_brand_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_journal_line_brand_integrity() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
