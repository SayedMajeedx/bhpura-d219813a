-- Pura Fit Passport: versioned, tenant-scoped customer measurements.
CREATE TABLE IF NOT EXISTS public.customer_fit_passports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  measurements jsonb NOT NULL DEFAULT '{}'::jsonb,
  fit_preference text NOT NULL DEFAULT 'regular' CHECK (fit_preference IN ('slim', 'regular', 'relaxed')),
  preferred_length_unit text NOT NULL DEFAULT 'in' CHECK (preferred_length_unit IN ('in', 'cm')),
  tailoring_notes text,
  consent_to_store boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, customer_id)
);

CREATE TABLE IF NOT EXISTS public.customer_fit_passport_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id uuid NOT NULL REFERENCES public.customer_fit_passports(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fit_passport_customer
  ON public.customer_fit_passports (brand_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fit_passport_history
  ON public.customer_fit_passport_history (passport_id, version DESC);

ALTER TABLE public.customer_fit_passports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_fit_passport_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_fit_passports" ON public.customer_fit_passports
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id))
  WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "customers_read_own_fit_passport" ON public.customer_fit_passports
  FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE auth_user_id = auth.uid()));

CREATE POLICY "staff_read_fit_passport_history" ON public.customer_fit_passport_history
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

CREATE OR REPLACE FUNCTION public.version_customer_fit_passport()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW.measurements, NEW.fit_preference, NEW.preferred_length_unit, NEW.tailoring_notes, NEW.consent_to_store, NEW.verified_at)
    IS NOT DISTINCT FROM
    ROW(OLD.measurements, OLD.fit_preference, OLD.preferred_length_unit, OLD.tailoring_notes, OLD.consent_to_store, OLD.verified_at) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.version := OLD.version + 1;
  END IF;
  NEW.updated_at := now();
  NEW.verified_by := CASE WHEN NEW.verified_at IS NULL THEN NULL ELSE auth.uid() END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_customer_fit_passport()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.customer_fit_passport_history
    (passport_id, brand_id, customer_id, version, snapshot, changed_by)
  VALUES
    (NEW.id, NEW.brand_id, NEW.customer_id, NEW.version, to_jsonb(NEW) - 'id', auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fit_passport_version ON public.customer_fit_passports;
CREATE TRIGGER trg_fit_passport_version
  BEFORE UPDATE ON public.customer_fit_passports
  FOR EACH ROW EXECUTE FUNCTION public.version_customer_fit_passport();

DROP TRIGGER IF EXISTS trg_fit_passport_archive ON public.customer_fit_passports;
CREATE TRIGGER trg_fit_passport_archive
  AFTER INSERT OR UPDATE ON public.customer_fit_passports
  FOR EACH ROW EXECUTE FUNCTION public.archive_customer_fit_passport();

