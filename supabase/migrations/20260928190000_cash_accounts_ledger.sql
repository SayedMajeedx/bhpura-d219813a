-- Bug #25: nothing created a brand's cash accounts or put money in them, so
-- the cash box and bank cards always showed zero and every transfer was
-- refused (CASH_ACCOUNTS_MISSING).
--
-- The store has no live link to a real bank, so the balances are a ledger the
-- system keeps from what the merchant confirms:
--   1. Every brand has one cash box and one bank account (backfilled here,
--      created for new brands by a trigger).
--   2. Reconciling a paid order posts its total: cash / cash-on-delivery into
--      the cash box, card and Benefit into the bank account. Undoing the
--      reconciliation reverses the posting from the account it went to.
--   3. record_cash_account_entry records a manual cash in / cash out (opening
--      balance, owner deposit or withdrawal), refusing to overdraw.
--   4. transfer_cash_to_bank (bug #24) is unchanged.
-- Every movement is a row in account_transactions.

-- One account of each type per brand.
CREATE UNIQUE INDEX IF NOT EXISTS cash_flow_accounts_brand_type_key
  ON public.cash_flow_accounts (brand_id, account_type);

CREATE OR REPLACE FUNCTION public.ensure_cash_flow_accounts(p_brand_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.cash_flow_accounts (brand_id, account_type, name_ar, name_en)
  VALUES
    (p_brand_id, 'cash_box', 'الصندوق النقدي', 'Cash box'),
    (p_brand_id, 'bank_account', 'الحساب البنكي', 'Bank account')
  ON CONFLICT (brand_id, account_type) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.ensure_cash_flow_accounts(uuid) FROM PUBLIC, anon, authenticated;

SELECT public.ensure_cash_flow_accounts(b.id) FROM public.brands b;

CREATE OR REPLACE FUNCTION public.create_brand_cash_flow_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_cash_flow_accounts(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_brand_cash_flow_accounts() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS create_brand_cash_flow_accounts ON public.brands;
CREATE TRIGGER create_brand_cash_flow_accounts
AFTER INSERT ON public.brands
FOR EACH ROW EXECUTE FUNCTION public.create_brand_cash_flow_accounts();

-- Where an order's money lands: cash in the cash box, everything else in the bank.
CREATE OR REPLACE FUNCTION public.cash_account_type_for_payment(p_payment_method text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(btrim(COALESCE(p_payment_method, ''))) IN ('cod', 'cash', 'cash_on_delivery', 'cash on delivery')
      THEN 'cash_box'
    ELSE 'bank_account'
  END;
$$;

CREATE OR REPLACE FUNCTION public.post_order_reconciliation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posted numeric;
  v_account uuid;
  v_amount numeric;
BEGIN
  IF NEW.reconciliation_status IS NOT DISTINCT FROM OLD.reconciliation_status THEN
    RETURN NEW;
  END IF;

  PERFORM public.ensure_cash_flow_accounts(NEW.brand_id);
  -- Serialise postings per brand so concurrent reconciliations cannot double-post.
  PERFORM 1 FROM public.cash_flow_accounts WHERE brand_id = NEW.brand_id ORDER BY id FOR UPDATE;

  -- What this order has already put in an account (net of reversals).
  SELECT COALESCE(SUM(CASE WHEN transaction_type = 'order_payment' THEN amount ELSE -amount END), 0)
    INTO v_posted
  FROM public.account_transactions
  WHERE brand_id = NEW.brand_id
    AND reference_id = NEW.id::text
    AND transaction_type IN ('order_payment', 'order_payment_reversal');

  IF NEW.reconciliation_status = 'reconciled' THEN
    v_amount := CASE WHEN lower(COALESCE(NEW.payment_status, '')) = 'paid'
      THEN COALESCE(NEW.total, 0) ELSE 0 END;
    IF v_amount > 0 AND v_posted = 0 THEN
      SELECT id INTO v_account FROM public.cash_flow_accounts
      WHERE brand_id = NEW.brand_id
        AND account_type = public.cash_account_type_for_payment(NEW.payment_method);
      UPDATE public.cash_flow_accounts SET balance = balance + v_amount WHERE id = v_account;
      INSERT INTO public.account_transactions (
        brand_id, target_account_id, amount, transaction_type, reference_id, notes
      ) VALUES (
        NEW.brand_id, v_account, v_amount, 'order_payment', NEW.id::text,
        'تسوية الطلب #' || COALESCE(NEW.invoice_number::text, '')
      );
    END IF;
  ELSIF v_posted > 0 THEN
    -- Reverse from the account the payment went to, even if that overdraws it
    -- (the money was moved on since): the balance then shows the gap.
    SELECT target_account_id INTO v_account FROM public.account_transactions
    WHERE brand_id = NEW.brand_id AND reference_id = NEW.id::text
      AND transaction_type = 'order_payment'
    ORDER BY created_at DESC
    LIMIT 1;
    UPDATE public.cash_flow_accounts SET balance = balance - v_posted WHERE id = v_account;
    INSERT INTO public.account_transactions (
      brand_id, source_account_id, amount, transaction_type, reference_id, notes
    ) VALUES (
      NEW.brand_id, v_account, v_posted, 'order_payment_reversal', NEW.id::text,
      'إلغاء تسوية الطلب #' || COALESCE(NEW.invoice_number::text, '')
    );
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.post_order_reconciliation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS post_order_reconciliation ON public.orders;
CREATE TRIGGER post_order_reconciliation
AFTER UPDATE OF reconciliation_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.post_order_reconciliation();

-- A manual movement the merchant records (no bank feed exists).
CREATE OR REPLACE FUNCTION public.record_cash_account_entry(
  p_brand_id uuid,
  p_account_type text,
  p_direction text,
  p_amount numeric,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.cash_flow_accounts%ROWTYPE;
  v_transaction_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_ENTRY_AMOUNT';
  END IF;
  IF p_direction NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'INVALID_ENTRY_DIRECTION';
  END IF;
  IF p_account_type NOT IN ('cash_box', 'bank_account') THEN
    RAISE EXCEPTION 'INVALID_ENTRY_ACCOUNT';
  END IF;
  -- The same rule as the cash accounts' RLS policy and the transfer.
  IF p_brand_id IS NULL
     OR NOT public.can_access_brand(p_brand_id)
     OR NOT public.has_permission('view_financials') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  PERFORM public.ensure_cash_flow_accounts(p_brand_id);
  SELECT * INTO v_account FROM public.cash_flow_accounts
  WHERE brand_id = p_brand_id AND account_type = p_account_type
  FOR UPDATE;

  IF p_direction = 'out' AND v_account.balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  UPDATE public.cash_flow_accounts
  SET balance = balance + CASE WHEN p_direction = 'in' THEN p_amount ELSE -p_amount END
  WHERE id = v_account.id;

  INSERT INTO public.account_transactions (
    brand_id, source_account_id, target_account_id, amount, transaction_type, notes
  ) VALUES (
    p_brand_id,
    CASE WHEN p_direction = 'out' THEN v_account.id END,
    CASE WHEN p_direction = 'in' THEN v_account.id END,
    p_amount,
    CASE WHEN p_direction = 'in' THEN 'manual_in' ELSE 'manual_out' END,
    NULLIF(btrim(p_notes), '')
  )
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_cash_account_entry(uuid, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_cash_account_entry(uuid, text, text, numeric, text) TO authenticated;
