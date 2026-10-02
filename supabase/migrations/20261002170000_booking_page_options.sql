-- Booking page options: how a services store's booking page looks.
--
--   package_style   how packages stand out from services on the booking page:
--                   glow (a soft animated border), shimmer (a light sweep),
--                   ribbon (a corner ribbon, still), plain (tinted, no animation)
--
-- One row per store. Customers read it (the booking page needs it); only people
-- who manage the store's settings write it. Additive: a new table, nothing
-- existing changes. Later page options belong here too.

CREATE TABLE IF NOT EXISTS public.booking_page_options (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  package_style text NOT NULL DEFAULT 'glow'
    CHECK (package_style IN ('glow', 'shimmer', 'ribbon', 'plain')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_page_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public reads booking page options" ON public.booking_page_options;
CREATE POLICY "public reads booking page options" ON public.booking_page_options
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "settings managers write booking page options" ON public.booking_page_options;
CREATE POLICY "settings managers write booking page options" ON public.booking_page_options
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));
