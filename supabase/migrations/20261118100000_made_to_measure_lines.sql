-- ==============================================================================
-- A piece made to the customer's measurements has no size.
--
-- The owner's report of 2026-11-04: a made-to-measure order read "Size 56" on the order page,
-- the job sheet and the invoice. On the product page, a piece being tailored is still priced by
-- one of the product's sizes (the first one when none was chosen), and the order builder wrote
-- that size on the line as if the shopper had chosen it; the admin's tailoring panel kept the
-- size a line already had when measurements were typed.
--
-- The rule is held on the table, so every writer follows it (the storefront's order builder, the
-- order editor's save, which replaces every line, and anything to come): an order line made to
-- order (`location = 'custom'`) that carries measurements, or the storefront's own mark
-- (`made_to_measure`), is made to measure: its `selected_variant` loses the size and says
-- `made_to_measure: true`. A piece made to order in one of the store's sizes, with no
-- measurements, keeps its size: that is the size it is made in.
--
-- Which answers are measurements is `order_line_measurement_key`, the twin of `isMeasurementKey`
-- (`src/lib/made-to-measure.ts`), run against it by the migration's test. Lines already written
-- are put right once, below, without re-running the stock engine (nothing about their stock
-- changes).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.order_line_measurement_key(p_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_key IS NOT NULL AND (
    p_key = 'made_to_measure'
    OR (
      (p_key LIKE 'fit\_%' OR p_key = 'custom_measurements' OR strpos(p_key, 'measurement') > 0
        OR p_key LIKE 'sizing\_%' OR strpos(p_key, 'passport') > 0)
      -- What the measurements are in, which profile and which version: not a measurement.
      AND p_key NOT LIKE '%\_unit' AND p_key NOT LIKE '%\_version' AND p_key NOT LIKE '%\_profile'
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.order_line_made_to_measure(p_location text, p_fields jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_location, '') = 'custom'
     AND jsonb_typeof(p_fields) = 'array'
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_fields) AS field
        WHERE jsonb_typeof(field) = 'object'
          AND public.order_line_measurement_key(field ->> 'key')
          AND btrim(COALESCE(field ->> 'value', '')) <> ''
     )
$$;

CREATE OR REPLACE FUNCTION public.order_items_made_to_measure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_variant jsonb := CASE WHEN jsonb_typeof(NEW.selected_variant) = 'object'
                          THEN NEW.selected_variant END;
BEGIN
  IF public.order_line_made_to_measure(NEW.location, NEW.custom_field_values) THEN
    NEW.selected_variant := (COALESCE(v_variant, '{}'::jsonb) - 'size')
      || jsonb_build_object('made_to_measure', true);
  ELSIF v_variant ? 'made_to_measure' THEN
    NEW.selected_variant := v_variant - 'made_to_measure';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.order_items_made_to_measure() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_items_made_to_measure ON public.order_items;
CREATE TRIGGER trg_order_items_made_to_measure
  BEFORE INSERT OR UPDATE OF location, custom_field_values, selected_variant ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_made_to_measure();

-- The lines already written, once. The stock engine's line trigger is told to stand aside, as
-- the editor's own replacement of lines does: no line changes its stock here.
DO $$
BEGIN
  PERFORM set_config('inventory.suppress_items_trigger', '1', true);
  UPDATE public.order_items
     SET selected_variant = selected_variant
   WHERE public.order_line_made_to_measure(location, custom_field_values)
     AND NOT COALESCE((selected_variant ->> 'made_to_measure')::boolean, false);
  PERFORM set_config('inventory.suppress_items_trigger', '0', true);
END $$;

NOTIFY pgrst, 'reload schema';
