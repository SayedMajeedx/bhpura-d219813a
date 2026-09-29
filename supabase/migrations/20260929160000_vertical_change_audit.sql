-- Migration: 20260929160000_vertical_change_audit.sql
--
-- Verticals V2, phase 1: a store's vertical changes in one audited step.
--
-- 1. brand_vertical_changes: who changed a store's vertical, from what, to
--    what, why, and what the change did. The brand's own staff can read
--    their history; only apply_brand_vertical_change writes it.
-- 2. apply_brand_vertical_change: a super admin's change, applied in one
--    transaction. The vertical flips, the add-ons chosen are switched off,
--    categories follow (a category a product uses is never removed; that is
--    checked again here, inside the transaction) and the change is recorded.
--    The add-ons the new vertical needs are installed just before by the
--    server (their seeds are application code); the server passes their ids
--    so the record lists them.
-- 3. business_settings rows can be deleted only by a super admin (brand
--    staff with manage_settings could delete their store's settings row).

CREATE TABLE IF NOT EXISTS public.brand_vertical_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  from_vertical text NOT NULL,
  to_vertical text NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(applied) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_vertical_changes_brand_created_idx
  ON public.brand_vertical_changes (brand_id, created_at DESC);

ALTER TABLE public.brand_vertical_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand reads its vertical history" ON public.brand_vertical_changes;
CREATE POLICY "brand reads its vertical history" ON public.brand_vertical_changes
  FOR SELECT USING (public.can_access_brand(brand_id));

GRANT SELECT ON public.brand_vertical_changes TO authenticated;
GRANT ALL ON public.brand_vertical_changes TO service_role;

CREATE OR REPLACE FUNCTION public.apply_brand_vertical_change(
  p_brand_id uuid,
  p_to_vertical text,
  p_reason text,
  p_installed_addons text[] DEFAULT '{}',
  p_disable_addons text[] DEFAULT '{}',
  p_remove_category_ids uuid[] DEFAULT '{}',
  p_add_categories jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from text;
  v_disabled text[] := '{}';
  v_removed uuid[] := '{}';
  v_added int := 0;
  v_cat record;
  v_change_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'STORE_VERTICAL_SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'VERTICAL_CHANGE_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT store_vertical INTO v_from
  FROM public.business_settings
  WHERE brand_id = p_brand_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BRAND_SETTINGS_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_from = p_to_vertical THEN
    RAISE EXCEPTION 'VERTICAL_UNCHANGED' USING ERRCODE = '22023';
  END IF;

  -- The vertical itself (its CHECK constraint validates the value).
  UPDATE public.business_settings
  SET store_vertical = p_to_vertical, updated_at = now()
  WHERE brand_id = p_brand_id;

  -- Add-ons switched off: hidden, their data kept.
  WITH switched AS (
    UPDATE public.brand_addons
    SET status = 'disabled', updated_at = now()
    WHERE brand_id = p_brand_id
      AND addon_id = ANY (p_disable_addons)
      AND status = 'installed'
    RETURNING addon_id
  )
  SELECT COALESCE(array_agg(addon_id), '{}') INTO v_disabled FROM switched;

  INSERT INTO public.brand_addon_events (brand_id, addon_id, action, actor_user_id, source, details)
  SELECT p_brand_id, a, 'disable', auth.uid(), 'super_admin', jsonb_build_object('reason', 'vertical_change')
  FROM unnest(v_disabled) AS a;

  -- Categories no product uses (checked again now, inside the transaction).
  WITH removed AS (
    DELETE FROM public.categories c
    WHERE c.brand_id = p_brand_id
      AND c.id = ANY (p_remove_category_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.brand_id = p_brand_id
          AND p.category IS NOT NULL
          AND lower(btrim(p.category)) IN (
            lower(c.id::text),
            lower(btrim(COALESCE(c.slug, ''))),
            lower(btrim(COALESCE(c.name_en, ''))),
            lower(btrim(COALESCE(c.name_ar, '')))
          )
      )
    RETURNING c.id
  )
  SELECT COALESCE(array_agg(id), '{}') INTO v_removed FROM removed;

  -- The new vertical's default categories that are missing.
  FOR v_cat IN
    SELECT * FROM jsonb_to_recordset(COALESCE(p_add_categories, '[]'::jsonb))
      AS x(name_en text, name_ar text, slug text, sort_order int)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.categories
      WHERE brand_id = p_brand_id AND lower(slug) = lower(v_cat.slug)
    ) THEN
      INSERT INTO public.categories (brand_id, name_en, name_ar, slug, sort_order, is_active)
      VALUES (p_brand_id, v_cat.name_en, v_cat.name_ar, v_cat.slug, COALESCE(v_cat.sort_order, 0), true);
      v_added := v_added + 1;
    END IF;
  END LOOP;

  INSERT INTO public.brand_vertical_changes (brand_id, from_vertical, to_vertical, reason, changed_by, applied)
  VALUES (
    p_brand_id,
    v_from,
    p_to_vertical,
    btrim(p_reason),
    auth.uid(),
    jsonb_build_object(
      'installed_addons', to_jsonb(COALESCE(p_installed_addons, '{}')),
      'disabled_addons', to_jsonb(v_disabled),
      'removed_category_ids', to_jsonb(v_removed),
      'added_categories', v_added
    )
  )
  RETURNING id INTO v_change_id;

  RETURN jsonb_build_object(
    'change_id', v_change_id,
    'from', v_from,
    'to', p_to_vertical,
    'disabled_addons', to_jsonb(v_disabled),
    'removed_categories', cardinality(v_removed),
    'added_categories', v_added
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_brand_vertical_change(uuid, text, text, text[], text[], uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_brand_vertical_change(uuid, text, text, text[], text[], uuid[], jsonb) TO authenticated;

-- 3. Only a super admin deletes a store's settings row.
DROP POLICY IF EXISTS "brand delete settings" ON public.business_settings;
DROP POLICY IF EXISTS "super admins delete settings" ON public.business_settings;
CREATE POLICY "super admins delete settings" ON public.business_settings
  FOR DELETE USING (public.is_super_admin());

NOTIFY pgrst, 'reload schema';
