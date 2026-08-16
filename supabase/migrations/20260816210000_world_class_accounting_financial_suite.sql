-- Migration: World-Class Accounting & Financial Management Suite for Boutq OS
-- Created At: 2026-08-16

-- 1. Packaging Materials & Bill of Materials (BOM)
CREATE TABLE IF NOT EXISTS public.packaging_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    name_ar TEXT,
    sku TEXT,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    unit_cost NUMERIC(10,3) NOT NULL DEFAULT 0.000,
    reorder_level INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.product_bom_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    packaging_material_id UUID NOT NULL REFERENCES public.packaging_materials(id) ON DELETE CASCADE,
    quantity_per_unit INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS direct_packaging_cost NUMERIC(10,3) DEFAULT 0.000;

-- 2. Expense Enhancements (COGS vs OpEx, Recurring Expenses, Vendors)
CREATE TABLE IF NOT EXISTS public.vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    tax_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS expense_type TEXT DEFAULT 'opex', -- 'cogs' or 'opex'
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS recurrence_period TEXT DEFAULT 'monthly', -- 'monthly' or 'yearly'
ADD COLUMN IF NOT EXISTS next_recurrence_date DATE,
ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL;

-- 3. Cash Flow, Liquidity & Reconciliation
CREATE TABLE IF NOT EXISTS public.cash_flow_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    account_type TEXT NOT NULL DEFAULT 'cash_box', -- 'cash_box' or 'bank_account'
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    balance NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.account_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    source_account_id UUID REFERENCES public.cash_flow_accounts(id) ON DELETE SET NULL,
    target_account_id UUID REFERENCES public.cash_flow_accounts(id) ON DELETE SET NULL,
    amount NUMERIC(12,3) NOT NULL,
    transaction_type TEXT NOT NULL, -- 'transfer', 'income', 'expense'
    reference_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS reconciliation_status TEXT DEFAULT 'unreconciled', -- 'unreconciled', 'pending', 'reconciled'
ADD COLUMN IF NOT EXISTS payment_account TEXT DEFAULT 'cash_box'; -- 'cash_box', 'bank_account'

-- 4. Vendor Purchase Orders (Accounts Payable)
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    po_number TEXT NOT NULL,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ordered', -- 'draft', 'ordered', 'received', 'cancelled'
    total_amount NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    paid_amount NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_cost NUMERIC(10,3) NOT NULL DEFAULT 0.000,
    line_total NUMERIC(12,3) NOT NULL DEFAULT 0.000
);

-- 5. Double-Entry Bookkeeping Ledger
CREATE TABLE IF NOT EXISTS public.ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    category TEXT NOT NULL, -- 'asset', 'liability', 'equity', 'revenue', 'expense'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    entry_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reference_type TEXT, -- 'order', 'expense', 'po', 'manual'
    reference_id TEXT,
    narration TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE CASCADE,
    debit NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    credit NUMERIC(12,3) NOT NULL DEFAULT 0.000
);

-- RLS Security Policies
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

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'packaging_materials' AND policyname = 'Tenant Packaging Materials Access') THEN
        CREATE POLICY "Tenant Packaging Materials Access" ON public.packaging_materials FOR ALL USING (auth.uid() IS NOT NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_bom_items' AND policyname = 'Tenant BOM Items Access') THEN
        CREATE POLICY "Tenant BOM Items Access" ON public.product_bom_items FOR ALL USING (auth.uid() IS NOT NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vendors' AND policyname = 'Tenant Vendors Access') THEN
        CREATE POLICY "Tenant Vendors Access" ON public.vendors FOR ALL USING (auth.uid() IS NOT NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cash_flow_accounts' AND policyname = 'Tenant Cash Accounts Access') THEN
        CREATE POLICY "Tenant Cash Accounts Access" ON public.cash_flow_accounts FOR ALL USING (auth.uid() IS NOT NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'account_transactions' AND policyname = 'Tenant Transactions Access') THEN
        CREATE POLICY "Tenant Transactions Access" ON public.account_transactions FOR ALL USING (auth.uid() IS NOT NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchase_orders' AND policyname = 'Tenant PO Access') THEN
        CREATE POLICY "Tenant PO Access" ON public.purchase_orders FOR ALL USING (auth.uid() IS NOT NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchase_order_items' AND policyname = 'Tenant PO Items Access') THEN
        CREATE POLICY "Tenant PO Items Access" ON public.purchase_order_items FOR ALL USING (auth.uid() IS NOT NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ledger_accounts' AND policyname = 'Tenant Ledger Accounts Access') THEN
        CREATE POLICY "Tenant Ledger Accounts Access" ON public.ledger_accounts FOR ALL USING (auth.uid() IS NOT NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'journal_entries' AND policyname = 'Tenant Journal Entries Access') THEN
        CREATE POLICY "Tenant Journal Entries Access" ON public.journal_entries FOR ALL USING (auth.uid() IS NOT NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'journal_entry_lines' AND policyname = 'Tenant Journal Entry Lines Access') THEN
        CREATE POLICY "Tenant Journal Entry Lines Access" ON public.journal_entry_lines FOR ALL USING (auth.uid() IS NOT NULL);
    END IF;
END $$;
