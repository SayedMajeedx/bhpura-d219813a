-- A store's opening hours and its busy pause (the owner's request of 2026-10-27, after comparing
-- Boutq with another platform).
--
--   * Busy pause: `business_settings.orders_paused_until`. While it is in the future the store
--     takes no new storefront order and no new booking ('infinity': until the store reopens).
--     Staff orders and staff bookings are not touched.
--   * Opening hours: `business_settings.opening_hours` ({enabled, timezone, after_hours, days}),
--     the windows of each weekday on the store's clock. Outside them the store either takes the
--     order and says when it will be handled (after_hours 'accept', the default, the owner's
--     decision) or refuses it (after_hours 'refuse': a bakery or a coffee shop). Opening hours
--     never refuse a booking: it is for a later day and has its own calendar.
--
-- The rules are held on the tables (as the payment methods and the fulfilment are), so every way
-- an order or a booking is written follows them. `store_open_state` is the rule for the hours;
-- `openState` (src/lib/opening-hours.ts) is its twin for the storefront's banner and checkout,
-- run against it by tests/opening-hours-parity.test.ts.

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS orders_paused_until timestamptz,
  ADD COLUMN IF NOT EXISTS opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.business_settings DROP CONSTRAINT IF EXISTS business_settings_opening_hours_shape;
ALTER TABLE public.business_settings ADD CONSTRAINT business_settings_opening_hours_shape
  CHECK (jsonb_typeof(opening_hours) = 'object' AND octet_length(opening_hours::text) <= 4096);

COMMENT ON COLUMN public.business_settings.orders_paused_until IS
  'Busy pause: no new storefront order or booking before this moment (infinity: until reopened).';
COMMENT ON COLUMN public.business_settings.opening_hours IS
  'Opening hours: {enabled, timezone, after_hours (accept|refuse), days: {"0": [{from, to}], ...}}, 0 = Sunday.';

-- Whether the store is open at a moment by its hours, and when it next opens: {enabled, open,
-- next_open}. A store with no hours set is always open. A window is "HH:MM" to "HH:MM" (or
-- "24:00"), on the store's clock; one that ends before it starts is ignored. The clocks are the
-- Gulf's (as the delivery schedule's), Bahrain by default.
CREATE OR REPLACE FUNCTION public.store_open_state(p_hours jsonb, p_at timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_tz text := CASE
    WHEN p_hours ->> 'timezone' IN ('Asia/Bahrain', 'Asia/Riyadh', 'Asia/Kuwait', 'Asia/Qatar',
                                    'Asia/Dubai', 'Asia/Muscat')
      THEN p_hours ->> 'timezone'
    ELSE 'Asia/Bahrain'
  END;
  v_local timestamp;
  v_day date;
  v_time text;
  v_from text;
  v_to text;
  v_best text;
  w jsonb;
  d integer;
BEGIN
  IF jsonb_typeof(p_hours) IS DISTINCT FROM 'object'
     OR NOT COALESCE((p_hours ->> 'enabled')::boolean, false) THEN
    RETURN jsonb_build_object('enabled', false, 'open', true, 'next_open', NULL);
  END IF;

  v_local := p_at AT TIME ZONE v_tz;
  v_day := v_local::date;
  v_time := to_char(v_local, 'HH24:MI');

  FOR d IN 0 .. 7 LOOP
    v_best := NULL;
    FOR w IN
      SELECT value FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_hours -> 'days' -> (extract(dow FROM v_day + d)::integer)::text) = 'array'
             THEN p_hours -> 'days' -> (extract(dow FROM v_day + d)::integer)::text
             ELSE '[]'::jsonb END)
    LOOP
      v_from := w ->> 'from';
      v_to := w ->> 'to';
      CONTINUE WHEN v_from IS NULL OR v_to IS NULL
        OR v_from !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR (v_to !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND v_to <> '24:00')
        OR v_from >= v_to;
      IF d = 0 AND v_time >= v_from AND v_time < v_to THEN
        RETURN jsonb_build_object('enabled', true, 'open', true, 'next_open', NULL);
      END IF;
      CONTINUE WHEN d = 0 AND v_from <= v_time;
      IF v_best IS NULL OR v_from < v_best THEN
        v_best := v_from;
      END IF;
    END LOOP;
    IF v_best IS NOT NULL THEN
      RETURN jsonb_build_object(
        'enabled', true, 'open', false,
        'next_open', ((v_day + d)::timestamp + v_best::time) AT TIME ZONE v_tz);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('enabled', true, 'open', false, 'next_open', NULL);
END;
$$;

-- ── A storefront order while the store is paused ────────────────────────────────────────────────
-- Named to run after the trigger that fills a new order's store (`trg_orders_default_brand`):
-- BEFORE triggers run in the order of their names.
CREATE OR REPLACE FUNCTION public.refuse_storefront_order_while_paused()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.channel IS DISTINCT FROM 'storefront' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.business_settings s
     WHERE s.brand_id = NEW.brand_id AND s.orders_paused_until > now()
  ) THEN
    RAISE EXCEPTION 'ORDERS_PAUSED';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_storefront_order_while_paused() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_paused ON public.orders;
CREATE TRIGGER trg_orders_paused
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.refuse_storefront_order_while_paused();

-- ── A booking from the storefront while the store is paused ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refuse_storefront_booking_while_paused()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source IS DISTINCT FROM 'storefront' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.business_settings s
     WHERE s.brand_id = NEW.brand_id AND s.orders_paused_until > now()
  ) THEN
    RAISE EXCEPTION 'ORDERS_PAUSED';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_storefront_booking_while_paused() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bookings_paused ON public.bookings;
CREATE TRIGGER trg_bookings_paused
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.refuse_storefront_booking_while_paused();

-- ── A storefront order outside the hours of a store that refuses them ───────────────────────────
-- Checked when the transaction ends (as the fulfilment is): an appointment is written as a
-- delivery and marked "appointment" a moment later, and the hours never refuse an appointment.
CREATE OR REPLACE FUNCTION public.check_storefront_order_in_opening_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_method text;
  v_hours jsonb;
BEGIN
  IF NEW.channel IS DISTINCT FROM 'storefront' THEN
    RETURN NULL;
  END IF;
  SELECT o.fulfillment_method INTO v_method FROM public.orders o WHERE o.id = NEW.id;
  IF NOT FOUND OR v_method = 'appointment' THEN
    RETURN NULL;
  END IF;
  SELECT s.opening_hours INTO v_hours FROM public.business_settings s WHERE s.brand_id = NEW.brand_id;
  IF COALESCE(v_hours ->> 'after_hours', 'accept') = 'refuse'
     AND NOT (public.store_open_state(v_hours, now()) ->> 'open')::boolean THEN
    RAISE EXCEPTION 'STORE_CLOSED';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.check_storefront_order_in_opening_hours() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_opening_hours ON public.orders;
CREATE CONSTRAINT TRIGGER trg_orders_opening_hours
  AFTER INSERT ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_storefront_order_in_opening_hours();

-- ── What a visitor reads ────────────────────────────────────────────────────────────────────────
-- The live public settings view (equal to 20261024140000's, read from production on 2026-10-27)
-- with the pause and the hours at its end, for the storefront's banner and checkout.
CREATE OR REPLACE VIEW public.brand_public_settings AS
SELECT bs.brand_id,
    bs.business_name,
    bs.logo_url,
    bs.currency,
    bs.primary_color,
    bs.text_color,
    bs.background_color,
    bs.font_family,
    bs.font_url,
    bs.cod_enabled,
    bs.card_enabled,
    bs.benefit_enabled,
    bs.benefit_qr_url,
    bs.footer_note,
    bs.delivery_fee,
    bs.pickup_enabled,
    bs.delivery_enabled,
    bs.logo_size,
    bs.logo_align,
    bs.header_bg,
    bs.header_fg,
    bs.footer_bg,
    bs.footer_fg,
    bs.heading_color,
    bs.link_color,
    bs.btn_primary_bg,
    bs.btn_primary_fg,
    bs.btn_secondary_bg,
    bs.btn_secondary_fg,
    bs.btn_checkout_bg,
    bs.btn_checkout_fg,
    bs.pages,
    bs.whatsapp_enabled,
    bs.whatsapp_number,
    bs.socials,
    bs.favicon_url,
    bs.show_header_name,
    bs.show_hero_title,
    bs.show_hero_about,
    bs.show_footer_name,
    bs.storefront_font_en,
    bs.storefront_font_ar,
    bs.hero_title_size,
    bs.hero_title_color,
    bs.hero_title_align,
    bs.storefront_font_en_url,
    bs.storefront_font_ar_url,
    bs.hero_title_en,
    bs.hero_title_ar,
    bs.storefront_accent_color,
    bs.storefront_background_color,
    bs.storefront_text_color,
    bs.digital_delivery_enabled,
    bs.menu_bg,
    bs.menu_fg,
    bs.menu_title_en,
    bs.menu_title_ar,
    bs.menu_show_home,
    bs.menu_show_account,
    bs.menu_show_orders,
    bs.menu_show_pages,
    bs.home_promo_cards,
    bs.show_new_arrivals,
    bs.show_best_sellers,
    bs.new_arrivals_title_en,
    bs.new_arrivals_title_ar,
    bs.best_sellers_title_en,
    bs.best_sellers_title_ar,
    bs.announcement_enabled,
    bs.announcement_text_en,
    bs.announcement_text_ar,
    bs.announcement_bg,
    bs.announcement_fg,
    bs.announcement_bold,
    bs.announcement_italic,
    bs.announcement_dismissible,
    bs.announcement_scope,
    bs.announcement_audience,
    bs.global_sale_badges_enabled,
    bs.cart_drawer_checkout_bg,
    bs.cart_drawer_checkout_fg,
    bs.vat_inclusive,
    bs.shipping_zones,
    bs.storefront_loader_text_en,
    bs.storefront_loader_text_ar,
    bs.storefront_radius,
    bs.header_glass,
    bs.badge_accent,
    bs.secondary_banner_parallax_enabled,
    bs.secondary_banner_parallax_mobile_enabled,
    bs.secondary_banner_parallax_breakpoint,
    bs.trending_banner_background_url,
    bs.category_banner_background_url,
    bs.homepage_editorial_sections,
    bs.storefront_typography,
    bs.product_title_color,
    bs.price_color,
    bs.footer_logo_size,
    bs.trust_badges,
    bs.storefront_mode,
    bs.catalog_show_prices,
    bs.catalog_inquiry_message_en,
    bs.catalog_inquiry_message_ar,
    bs.store_vertical,
    bs.store_modules,
    bs.fit_profiles,
    bs.delivery_estimate_enabled,
    bs.delivery_estimate_ar,
    bs.delivery_estimate_en,
    bs.brand_palette,
    bs.invoice_inherit_brand_color,
    bs.invoice_inherit_brand_font,
    bs.storefront_design_version,
    bs.trust_bar_enabled,
    bs.trust_bar_position,
    bs.hero_overlay_strength,
    bs.hero_title_color_v2,
    bs.product_card_hover_image,
    bs.product_card_color_dots,
    bs.product_card_quick_add,
    bs.new_badge_days,
    bs.footer_layout,
    bs.footer_show_payment_methods,
    bs.newsletter_enabled,
    bs.newsletter_title_ar,
    bs.newsletter_title_en,
    bs.brand_story_enabled,
    bs.brand_story_image_url,
    bs.category_filters_enabled,
    bs.pdp_layout,
    bs.pdp_image_zoom,
    bs.social_proof_enabled,
    bs.recently_viewed_enabled,
    bs.motion_enabled,
    bs.quick_view_enabled,
    bs.back_in_stock_enabled,
    bs.fabric_care_ar,
    bs.fabric_care_en,
    bs.shipping_returns_ar,
    bs.shipping_returns_en,
    bs.business_hours_ar,
    bs.business_hours_en,
    bs.bundle_discount_percent,
    bs.hero_layout,
    bs.hero_height_desktop,
    bs.hero_aspect_mobile,
    bs.hero_show_arrows,
    bs.pdp_gallery_aspect_ratio,
    bs.hero_video_fit,
    bs.advance_payment_enabled,
    bs.advance_payment_percent,
    bs.advance_payment_scope,
    bs.storefront_banner_size,
    bs.delivery_estimate_tailored_ar,
    bs.delivery_estimate_tailored_en,
    bs.advance_allow_full_payment,
    bs.default_tax_rate,
    bs.product_card_aspect_ratio,
    bs.storefront_home_layout,
    bs.delivery_schedule,
    bs.orders_paused_until,
    bs.opening_hours
   FROM business_settings bs
     JOIN brands b ON b.id = bs.brand_id
  WHERE b.is_active = true;

GRANT SELECT ON public.brand_public_settings TO anon, authenticated, service_role;
