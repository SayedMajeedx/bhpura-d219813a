-- Migration: 20261120100000_post_kit_store.sql
--
-- The post kit (a private add-on) kept a store's edited posts and its own photos on one device.
-- They move here, so the store's team sees them on any device. Additive only: two new tables and
-- one helper. No browser-callable SECURITY DEFINER function is added.
--
-- Who: the staff who may open the content studio (`manage_inventory`, as PAGE_ACCESS says) read,
-- and write only while the store has the add-on installed. A courier passes neither check, and a
-- visitor has no policy at all.

CREATE OR REPLACE FUNCTION public.post_kit_may_write(p_brand uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.can_access_brand(p_brand)
     AND public.has_permission('manage_inventory')
     AND EXISTS (
       SELECT 1
       FROM public.brand_addons a
       WHERE a.brand_id = p_brand
         AND a.addon_id = 'post-kit'
         AND a.status = 'installed'
     );
$$;

-- One row per edited post. A post left as it came has no row.
CREATE TABLE public.post_kit_edits (
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  post_key text NOT NULL CHECK (post_key ~ '^[a-z0-9-]{1,60}$'),
  -- The post as the maker holds it, with its price tokens kept where the merchant left them.
  post jsonb NOT NULL CHECK (
    jsonb_typeof(post) = 'object'
    AND post ->> 'key' = post_key
    AND pg_column_size(post) <= 32768
  ),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, post_key)
);

-- The merchant's own photos. The file is in the store's own media folder and nowhere else, so a
-- row cannot make a colleague's browser load a picture from another address.
CREATE TABLE public.post_kit_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  url text NOT NULL CHECK (
    char_length(url) <= 300
    AND url ~ ('^https://[^/?#]+/brands/' || brand_id::text || '/post/[0-9a-f-]+\.(jpg|png|webp)$')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX post_kit_photos_brand_created_idx
  ON public.post_kit_photos (brand_id, created_at, id);

REVOKE ALL ON public.post_kit_edits FROM anon;
REVOKE ALL ON public.post_kit_photos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_kit_edits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_kit_photos TO authenticated;
GRANT ALL ON public.post_kit_edits TO service_role;
GRANT ALL ON public.post_kit_photos TO service_role;

ALTER TABLE public.post_kit_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_kit_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "studio staff read" ON public.post_kit_edits
  FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_inventory'));

CREATE POLICY "studio staff write" ON public.post_kit_edits
  FOR ALL TO authenticated
  USING (public.post_kit_may_write(brand_id))
  WITH CHECK (public.post_kit_may_write(brand_id));

CREATE POLICY "studio staff read" ON public.post_kit_photos
  FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_inventory'));

CREATE POLICY "studio staff write" ON public.post_kit_photos
  FOR ALL TO authenticated
  USING (public.post_kit_may_write(brand_id))
  WITH CHECK (public.post_kit_may_write(brand_id));

CREATE TRIGGER post_kit_edits_updated_at
  BEFORE UPDATE ON public.post_kit_edits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
