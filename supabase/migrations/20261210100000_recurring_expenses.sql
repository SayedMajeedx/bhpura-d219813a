-- A recurring expense repeats by itself (the owner's report of 2026-11-16).
--
-- The expenses form saved "monthly" as a flag (`is_recurring`, `recurrence_period`) and nothing
-- ever read it: Pura's partner shop rent, entered from August as monthly, stayed in August alone,
-- so September to November read 150.000 more profit than they made.
--
-- Now an expense marked recurring is a template. The database writes one copy of it for each
-- month (or year) that has come, on the same day of the month (the 31st falls on a short
-- month's last day), from its own date to today: at once when it is saved (so an expense entered
-- for an earlier month fills the months since) and then every night. A copy is an ordinary
-- expense that names its template (`recurring_source_id`); the reports count it like any other.
-- Turning the template's repeat off stops it; the copies already written stay, and a copy that
-- is deleted does not come back (the template counts what it wrote, `recurring_generated`).
-- Turning it on again starts from the next date to come, never filling the months it was off.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurring_source_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurring_generated integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_expenses_recurring_source
  ON public.expenses (recurring_source_id) WHERE recurring_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_recurring_templates
  ON public.expenses (brand_id) WHERE is_recurring AND recurring_source_id IS NULL;

-- The browser reads the new columns (the expenses list names its columns).
GRANT SELECT (recurring_source_id, recurring_generated) ON public.expenses TO authenticated;

-- Today on the stores' clock (the Gulf). A test sets `boutq.today` to fix the day.
CREATE OR REPLACE FUNCTION public.expenses_recurring_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('boutq.today', true), '')::date,
    (now() AT TIME ZONE 'Asia/Bahrain')::date
  );
$$;

-- The k-th date after a template's own date: counted from its date each time, so a template on
-- the 31st is on the 31st again after a short month.
CREATE OR REPLACE FUNCTION public.expenses_recurring_date(p_start date, p_period text, p_step integer)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_start + (CASE WHEN lower(COALESCE(p_period, 'monthly')) = 'yearly'
    THEN interval '1 year' ELSE interval '1 month' END) * p_step)::date;
$$;

-- Writes the copies that are due: every template, or one. Answers how many it wrote.
CREATE OR REPLACE FUNCTION public.expenses_materialize_recurring(p_expense uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := public.expenses_recurring_today();
  v_template public.expenses%ROWTYPE;
  v_step integer;
  v_day date;
  v_written integer := 0;
  v_guard integer;
BEGIN
  FOR v_template IN
    SELECT * FROM public.expenses
    WHERE is_recurring IS TRUE
      AND recurring_source_id IS NULL
      AND expense_date IS NOT NULL
      AND (p_expense IS NULL OR id = p_expense)
    FOR UPDATE
  LOOP
    v_step := v_template.recurring_generated;
    v_guard := 0;
    LOOP
      v_day := public.expenses_recurring_date(
        v_template.expense_date, v_template.recurrence_period, v_step + 1
      );
      -- At most ten years of copies in one go, whatever date a template was given.
      EXIT WHEN v_day > v_today OR v_guard >= 120;
      INSERT INTO public.expenses (
        user_id, brand_id, category, description, amount, currency, expense_date, notes,
        store_name, tax_amount, tax_rate, expense_type, vendor_id, quantity, unit_type,
        unit_cost, is_recurring, recurring_source_id
      ) VALUES (
        v_template.user_id, v_template.brand_id, v_template.category, v_template.description,
        v_template.amount, v_template.currency, v_day, v_template.notes,
        v_template.store_name, v_template.tax_amount, v_template.tax_rate,
        v_template.expense_type, v_template.vendor_id, v_template.quantity,
        v_template.unit_type, v_template.unit_cost, false, v_template.id
      );
      v_step := v_step + 1;
      v_guard := v_guard + 1;
      v_written := v_written + 1;
    END LOOP;
    UPDATE public.expenses
    SET recurring_generated = v_step,
        next_recurrence_date = public.expenses_recurring_date(
          v_template.expense_date, v_template.recurrence_period, v_step + 1
        )
    WHERE id = v_template.id;
  END LOOP;
  RETURN v_written;
END;
$$;

-- A template's repeat turned on again starts from the next date to come: the months it was off
-- are not filled. A copy can never be a template.
CREATE OR REPLACE FUNCTION public.expenses_recurring_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_today date := public.expenses_recurring_today();
BEGIN
  IF NEW.recurring_source_id IS NOT NULL THEN
    NEW.is_recurring := false;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- The count is the database's: a form cannot rewind it and bring deleted copies back.
    NEW.recurring_generated := GREATEST(OLD.recurring_generated, NEW.recurring_generated);
    -- Turned on again after it had run: skip to the next date to come. Turned on for the first
    -- time (it never wrote a copy): its months since its date are filled, as on a new one.
    IF NEW.is_recurring IS TRUE AND OLD.is_recurring IS NOT TRUE
       AND NEW.recurring_generated > 0 AND NEW.expense_date IS NOT NULL THEN
      WHILE public.expenses_recurring_date(
        NEW.expense_date, NEW.recurrence_period, NEW.recurring_generated + 1
      ) <= v_today LOOP
        NEW.recurring_generated := NEW.recurring_generated + 1;
      END LOOP;
    END IF;
    IF NEW.is_recurring IS NOT TRUE THEN
      NEW.next_recurrence_date := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.expenses_recurring_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_recurring IS TRUE AND NEW.recurring_source_id IS NULL THEN
    PERFORM public.expenses_materialize_recurring(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_recurring_guard ON public.expenses;
CREATE TRIGGER trg_expenses_recurring_guard
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_recurring_guard();

DROP TRIGGER IF EXISTS trg_expenses_recurring_after_write ON public.expenses;
CREATE TRIGGER trg_expenses_recurring_after_write
  AFTER INSERT OR UPDATE OF is_recurring, recurrence_period ON public.expenses
  FOR EACH ROW
  WHEN (NEW.is_recurring IS TRUE AND NEW.recurring_source_id IS NULL)
  EXECUTE FUNCTION public.expenses_recurring_after_write();

-- Only the server and the database's own triggers write copies.
REVOKE EXECUTE ON FUNCTION public.expenses_materialize_recurring(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expenses_recurring_after_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expenses_recurring_guard() FROM PUBLIC, anon, authenticated;

-- Every night, just after midnight in the Gulf (21:05 UTC).
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expenses_recurring_nightly') THEN
      PERFORM cron.unschedule('expenses_recurring_nightly');
    END IF;
    PERFORM cron.schedule(
      'expenses_recurring_nightly',
      '5 21 * * *',
      'SELECT public.expenses_materialize_recurring();'
    );
  END IF;
END $$;

-- The templates saved before this: their months since are written now.
SELECT public.expenses_materialize_recurring();
