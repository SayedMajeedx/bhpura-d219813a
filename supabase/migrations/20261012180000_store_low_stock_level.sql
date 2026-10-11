-- The store's own low-stock level.
--
-- "Low" was the number 5 written in the code: the inventory list, the dashboard, the export, the
-- products report and the phone alert each carried their own copy. A boutique with one piece per
-- size and a roastery with a shelf of bags do not mean the same number, so a store had either a
-- list that was always amber or a warning that came too late.
--
-- 1. business_settings.low_stock_threshold: a product sold from stock is low at this many pieces
--    or fewer. 5 by default (what every store had), 0 turns the warning off (only "out" is left).
-- 2. The phone alert reads it, and no longer speaks for a made-to-order piece or a service: their
--    ready stock says nothing about whether they can be bought (the same rule as the list:
--    src/lib/product-availability.ts).
--
-- The dashboard, the export and the products report read the column in the app (lowStockLevel).

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5;

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_low_stock_threshold_range;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_low_stock_threshold_range
  CHECK (low_stock_threshold BETWEEN 0 AND 1000);

COMMENT ON COLUMN public.business_settings.low_stock_threshold IS
  'A product sold from stock is "low" at this many ready pieces or fewer. 0: no low warning.';

-- ── The phone alert ─────────────────────────────────────────────────────────
-- The live function with the store's level in place of 5, and silent for what is not sold from
-- stock. The wording, the event and its key are unchanged.
CREATE OR REPLACE FUNCTION public.enqueue_mobile_low_stock_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_stock numeric; v_old_stock numeric; v_name text; v_brand uuid; v_level integer; v_not_counted boolean;
BEGIN
  v_stock := COALESCE(NEW.stock_main, NEW.stock, 0); v_old_stock := COALESCE(OLD.stock_main, OLD.stock, 0);
  IF v_stock >= v_old_stock THEN RETURN NEW; END IF;
  SELECT p.brand_id, p.name, (COALESCE(p.is_made_to_order, false) OR COALESCE(p.item_kind, 'product') = 'service')
    INTO v_brand, v_name, v_not_counted FROM public.products p WHERE p.id = NEW.product_id;
  IF COALESCE(v_not_counted, false) THEN RETURN NEW; END IF;
  v_level := COALESCE((SELECT bs.low_stock_threshold FROM public.business_settings bs WHERE bs.brand_id = v_brand LIMIT 1), 5);
  IF v_stock <= v_level AND (v_old_stock > v_level OR v_old_stock IS NULL) THEN
    INSERT INTO public.push_notification_events (brand_id,event_type,entity_type,entity_id,dedupe_key,title,body,target_url,payload)
    VALUES (v_brand,'low_stock','variant',NEW.id,'low-stock:'||NEW.id||':'||v_stock,'تنبيه انخفاض المخزون',
      COALESCE(v_name,NULLIF(NEW.sku,''),'منتج')||' — المتبقي '||v_stock,'/inventory',jsonb_build_object('variant_id',NEW.id,'stock',v_stock))
    ON CONFLICT DO NOTHING;
  END IF; RETURN NEW;
END; $function$;

-- A trigger function: nobody calls it by hand.
REVOKE ALL ON FUNCTION public.enqueue_mobile_low_stock_push() FROM PUBLIC, anon, authenticated;

