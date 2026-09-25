-- Bug backlog #24: the cash box -> bank transfer was three separate client
-- writes whose errors were ignored, computed from the balances on screen, and
-- credited the bank the full amount even when the cash box held less.
-- One function now checks the cash box, moves the amount and logs it in a
-- single transaction. Additive: no table or policy changes.

CREATE OR REPLACE FUNCTION public.transfer_cash_to_bank(
  p_brand_id uuid,
  p_amount numeric,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cash public.cash_flow_accounts%ROWTYPE;
  v_bank public.cash_flow_accounts%ROWTYPE;
  v_transaction_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_TRANSFER_AMOUNT';
  END IF;
  -- The same rule as the cash accounts' RLS policy.
  IF p_brand_id IS NULL
     OR NOT public.can_access_brand(p_brand_id)
     OR NOT public.has_permission('view_financials') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- Lock the brand's accounts (in id order) so concurrent transfers queue
  -- instead of overwriting each other's balance.
  PERFORM 1 FROM public.cash_flow_accounts
   WHERE brand_id = p_brand_id AND account_type IN ('cash_box', 'bank_account')
   ORDER BY id
   FOR UPDATE;

  SELECT * INTO v_cash FROM public.cash_flow_accounts
   WHERE brand_id = p_brand_id AND account_type = 'cash_box'
   ORDER BY created_at, id
   LIMIT 1;
  SELECT * INTO v_bank FROM public.cash_flow_accounts
   WHERE brand_id = p_brand_id AND account_type = 'bank_account'
   ORDER BY created_at, id
   LIMIT 1;

  IF v_cash.id IS NULL OR v_bank.id IS NULL THEN
    RAISE EXCEPTION 'CASH_ACCOUNTS_MISSING';
  END IF;
  IF v_cash.balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_CASH_BALANCE';
  END IF;

  UPDATE public.cash_flow_accounts SET balance = balance - p_amount WHERE id = v_cash.id;
  UPDATE public.cash_flow_accounts SET balance = balance + p_amount WHERE id = v_bank.id;

  INSERT INTO public.account_transactions (
    brand_id, source_account_id, target_account_id, amount, transaction_type, notes
  ) VALUES (
    p_brand_id, v_cash.id, v_bank.id, p_amount, 'transfer',
    COALESCE(NULLIF(trim(p_notes), ''), 'إيداع نقدي من الصندوق إلى الحساب البنكي')
  )
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transfer_cash_to_bank(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_cash_to_bank(uuid, numeric, text) TO authenticated;
