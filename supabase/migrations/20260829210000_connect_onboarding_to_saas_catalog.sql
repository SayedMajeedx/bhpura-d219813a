-- Connect public onboarding selections to immutable SaaS plan versions.
ALTER TABLE public.tenant_requests
  ADD COLUMN IF NOT EXISTS selected_plan_id uuid REFERENCES public.saas_plans(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS selected_plan_version_id uuid REFERENCES public.saas_plan_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS billing_interval text CHECK (billing_interval IN ('monthly','annual','trial')),
  ADD COLUMN IF NOT EXISTS quoted_price numeric(10,2) CHECK (quoted_price >= 0),
  ADD COLUMN IF NOT EXISTS quoted_currency text,
  ADD COLUMN IF NOT EXISTS selected_plan_snapshot jsonb;

CREATE INDEX IF NOT EXISTS tenant_requests_selected_plan_idx
  ON public.tenant_requests (selected_plan_id, created_at DESC);

-- Public visitors may only discover plans explicitly published by the super admin.
DROP POLICY IF EXISTS "Public read active plans" ON public.saas_plans;
CREATE POLICY "Public read active public plans" ON public.saas_plans
FOR SELECT USING (is_active = true AND is_public = true OR public.is_super_admin());

DROP POLICY IF EXISTS "Public read plan versions" ON public.saas_plan_versions;
CREATE POLICY "Public read current published plan versions" ON public.saas_plan_versions
FOR SELECT USING (
  (
    is_current = true
    AND effective_from <= now()
    AND (effective_until IS NULL OR effective_until > now())
    AND EXISTS (
      SELECT 1 FROM public.saas_plans p
      WHERE p.id = plan_id AND p.is_active = true AND p.is_public = true
    )
  ) OR public.is_super_admin()
);

DROP POLICY IF EXISTS "Public read plan features" ON public.saas_plan_features;
CREATE POLICY "Public read published plan features" ON public.saas_plan_features
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.saas_plan_versions pv
    JOIN public.saas_plans p ON p.id = pv.plan_id
    WHERE pv.id = plan_version_id
      AND pv.is_current = true
      AND pv.effective_from <= now()
      AND (pv.effective_until IS NULL OR pv.effective_until > now())
      AND p.is_active = true
      AND p.is_public = true
  ) OR public.is_super_admin()
);

NOTIFY pgrst, 'reload schema';
