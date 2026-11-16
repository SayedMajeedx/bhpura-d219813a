-- A monthly budget per expense category (stage 4 of the expenses page plan, 2026-11-16).
--
-- A store says how much it means to spend a month on a category (rent, ads, packaging); the
-- expenses page compares each month's spending with it and says when one went over. A budget is
-- the store's own figure in its own currency, read and written by staff who may see the store's
-- finances (`can_view_brand_costs`, as the expenses and costs are), never by a visitor.

CREATE TABLE IF NOT EXISTS public.expense_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 80),
  monthly_amount numeric(14, 3) NOT NULL CHECK (monthly_amount > 0 AND monthly_amount < 100000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One budget per category, however it is spelt.
CREATE UNIQUE INDEX IF NOT EXISTS expense_budgets_one_per_category
  ON public.expense_budgets (brand_id, lower(btrim(category)));

ALTER TABLE public.expense_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff who see finances read budgets" ON public.expense_budgets;
CREATE POLICY "staff who see finances read budgets" ON public.expense_budgets
  FOR SELECT TO authenticated USING (public.can_view_brand_costs(brand_id));

DROP POLICY IF EXISTS "staff who see finances write budgets" ON public.expense_budgets;
CREATE POLICY "staff who see finances write budgets" ON public.expense_budgets
  FOR ALL TO authenticated
  USING (public.can_view_brand_costs(brand_id))
  WITH CHECK (public.can_view_brand_costs(brand_id));

REVOKE ALL ON public.expense_budgets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_budgets TO authenticated;

CREATE OR REPLACE FUNCTION public.expense_budgets_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.category := btrim(NEW.category);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_budgets_touch ON public.expense_budgets;
CREATE TRIGGER trg_expense_budgets_touch
  BEFORE INSERT OR UPDATE ON public.expense_budgets
  FOR EACH ROW EXECUTE FUNCTION public.expense_budgets_touch();
