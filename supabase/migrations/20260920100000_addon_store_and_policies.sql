-- Migration: 20260920100000_addon_store_and_policies.sql
-- Purpose: Add-on store policies, entitlement keys, and activity defaults for self-serve & super-admin

ALTER TABLE public.platform_addon_policies
  ADD COLUMN IF NOT EXISTS entitlement_key text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_for_activities text[] DEFAULT '{}'::text[];

-- Enable RLS on platform_addon_policies if not already enabled
ALTER TABLE public.platform_addon_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view platform addon policies" ON public.platform_addon_policies;
CREATE POLICY "Public can view platform addon policies" ON public.platform_addon_policies
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Super admin can manage platform addon policies" ON public.platform_addon_policies;
CREATE POLICY "Super admin can manage platform addon policies" ON public.platform_addon_policies
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Seed default policies for current add-ons
INSERT INTO public.platform_addon_policies (addon_id, availability, default_for_activities)
VALUES
  ('fashion-core', 'public', ARRAY['abayas', 'fashion']),
  ('size-guides', 'public', ARRAY['abayas', 'fashion', 'jewelry']),
  ('fit-passport', 'public', ARRAY['abayas', 'fashion']),
  ('made-to-order', 'public', ARRAY['abayas', 'fashion', 'jewelry', 'print']),
  ('abaya-pack', 'public', ARRAY['abayas'])
ON CONFLICT (addon_id) DO UPDATE
SET
  default_for_activities = EXCLUDED.default_for_activities,
  updated_at = now();

NOTIFY pgrst, 'reload schema';
