-- An offer's own wording for shoppers (the owner's request of 2026-11-14): the product page said
-- an offer only in the words the system writes from its terms ("20% off on ready-made pieces"), and
-- the store could not say it its own way ("Dar Lulwa week: 20% off the abayas on the shelf").
-- `terms_ar` / `terms_en` are what a shopper reads in that language; empty keeps the system's
-- words. Plain text, bounded; the amount an order gets is still the offer's rule alone.
--
-- storefront_active_offers is redefined from 20261208100000 with the two keys added.

ALTER TABLE public.store_offers
  ADD COLUMN IF NOT EXISTS terms_ar text NOT NULL DEFAULT '' CHECK (char_length(terms_ar) <= 140),
  ADD COLUMN IF NOT EXISTS terms_en text NOT NULL DEFAULT '' CHECK (char_length(terms_en) <= 140);

CREATE OR REPLACE FUNCTION public.storefront_active_offers(p_brand_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'kind', o.kind, 'name_ar', o.name_ar, 'name_en', o.name_en,
           'ends_at', o.ends_at, 'min_subtotal', o.min_subtotal, 'min_items', o.min_items,
           'product_ids', o.product_ids, 'category_slugs', o.category_slugs,
           'exclude_sale_items', o.exclude_sale_items,
           'discount_type', o.discount_type, 'discount_value', o.discount_value,
           'max_discount', o.max_discount,
           'buy_quantity', o.buy_quantity, 'get_quantity', o.get_quantity,
           'get_product_ids', o.get_product_ids, 'get_category_slugs', o.get_category_slugs,
           'get_percent', o.get_percent, 'max_sets', o.max_sets, 'local_only', o.local_only,
           'regions', o.regions,
           'pieces', o.pieces,
           -- ADDED (20261209100000): the store's own wording.
           'terms_ar', o.terms_ar, 'terms_en', o.terms_en
         ) ORDER BY o.created_at, o.id), '[]'::jsonb)
    FROM public.store_offers o
    JOIN public.brands b ON b.id = o.brand_id AND b.is_active
   WHERE b.slug = p_brand_slug
     AND o.is_active
     AND (o.starts_at IS NULL OR o.starts_at <= now())
     AND (o.ends_at IS NULL OR o.ends_at > now())
$function$;
