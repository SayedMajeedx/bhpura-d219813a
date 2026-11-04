-- ==============================================================================
-- Changing a custom order after it was placed (step 4 of docs/workshop-flow-plan.md).
--
-- The owner's report of 2026-11-03: a customer who changes a measurement before or while the
-- piece is made could not be put right on the order, and a tailor holding the earlier sheet was
-- never told. Now:
--
--   * Every order line has a revision (`order_items.revision`, 1 when written). A change to the
--     answers a line already had (its measurements, its details, the notes for the workshop), or
--     to a piece a supplier holds, raises it and is kept in `order_line_revisions` with what
--     changed (`{ key, label_ar, label_en, from, to }`, `order_line_field_changes`, the twin of
--     `lineFieldChanges` in `src/features/orders/lib/line-revisions.ts`), who and when, and is
--     written in the order's activity. The rule is a trigger on the table, so the order editor's
--     save is recorded as well as the dedicated step. A first answer on a line that had none is
--     not a revision.
--   * A supplier's line remembers the revision its sheet was (`purchase_order_items
--     .sheet_revision`, written by the database alone: the line's revision when the piece is
--     sent; null for lines sent before, read as 1). When the line's revision is higher, the
--     supplier has the earlier sheet; `mark_order_line_supplier_told` records that they were
--     given the new one (the revised sheet printed, or the change message opened).
--   * `amend_order_line_details` is the step "Change measurements" (order staff, in view mode
--     too): only a made-to-order piece, never on a released order nor once the piece has come
--     back from the supplier or been handed over (that is an alteration, step 3); only the
--     line's own answers, its product's fields and the notes for the workshop, bounded; one
--     request id writes once. It never touches a price or stock.
--   * The order editor's save (`replace_order_items`) keeps the lines it is given back: a line
--     that keeps its id is updated in place, only the lines taken out are deleted, and new ones
--     are added. It used to delete every line and write new ones, which cut a piece from its
--     supplier's order (`purchase_order_items.order_item_id` set to null), deleted the line's
--     returns (`return_items`, on cascade) and would have wiped its revisions; it was also why an
--     order with an alteration could not be saved at all (`ORDER_LINE_HAS_ALTERATION`). The
--     stock engine reconciles by size, not by line, so stock moves exactly as before. Its caller
--     check no longer lets a caller with no session through.
--   * `order_workshop_pieces` (order staff, no amounts) also says each supplier line's sheet
--     revision and its order line's revision.
-- ==============================================================================

-- 1. Revisions --------------------------------------------------------------------------------

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1);

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS sheet_revision integer CHECK (sheet_revision IS NULL OR sheet_revision >= 1);

CREATE TABLE IF NOT EXISTS public.order_line_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision >= 2),
  -- [{ key, label_ar, label_en, from, to }]
  changes jsonb NOT NULL
    CHECK (jsonb_typeof(changes) = 'array' AND jsonb_array_length(changes) BETWEEN 1 AND 100
           AND octet_length(changes::text) <= 64000),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  -- When the supplier holding the piece was given this revision (sheet printed, message opened).
  told_supplier_at timestamptz,
  told_by uuid,
  request_id uuid UNIQUE,
  UNIQUE (order_item_id, revision)
);
CREATE INDEX IF NOT EXISTS order_line_revisions_order_idx ON public.order_line_revisions (order_id);

ALTER TABLE public.order_line_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_line_revisions_staff_read ON public.order_line_revisions;
CREATE POLICY order_line_revisions_staff_read ON public.order_line_revisions
  FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id)
         AND (public.has_permission('manage_orders') OR public.has_permission('view_financials')));
-- Written only by the database (the trigger below).
REVOKE ALL ON public.order_line_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_line_revisions TO authenticated;

-- What changed between two answer lists, in the new list's order, then what was taken out. A
-- value is compared as text with its ends trimmed; the storefront's mark and a version number
-- are not answers. Twin of `lineFieldChanges`.
CREATE OR REPLACE FUNCTION public.order_line_field_changes(p_old jsonb, p_new jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  WITH o AS (
    SELECT DISTINCT ON (e ->> 'key') e ->> 'key' AS key, e, ord
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_old) = 'array' THEN p_old ELSE '[]'::jsonb END)
           WITH ORDINALITY AS t(e, ord)
     WHERE jsonb_typeof(e) = 'object' AND COALESCE(e ->> 'key', '') <> ''
     ORDER BY e ->> 'key', ord
  ), n AS (
    SELECT DISTINCT ON (e ->> 'key') e ->> 'key' AS key, e, ord
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_new) = 'array' THEN p_new ELSE '[]'::jsonb END)
           WITH ORDINALITY AS t(e, ord)
     WHERE jsonb_typeof(e) = 'object' AND COALESCE(e ->> 'key', '') <> ''
     ORDER BY e ->> 'key', ord
  ), k AS (
    SELECT COALESCE(n.key, o.key) AS key, n.e AS ne, o.e AS oe,
           CASE WHEN n.key IS NOT NULL THEN n.ord ELSE 1000000 + o.ord END AS ord,
           regexp_replace(COALESCE(o.e ->> 'value', ''), '^\s+|\s+$', '', 'g') AS from_value,
           regexp_replace(COALESCE(n.e ->> 'value', ''), '^\s+|\s+$', '', 'g') AS to_value
      FROM n FULL JOIN o ON o.key = n.key
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'key', key,
           'label_ar', COALESCE(NULLIF(ne ->> 'label_ar', ''), NULLIF(oe ->> 'label_ar', '')),
           'label_en', COALESCE(NULLIF(ne ->> 'label_en', ''), NULLIF(oe ->> 'label_en', '')),
           'from', from_value,
           'to', to_value) ORDER BY ord), '[]'::jsonb)
    FROM k
   WHERE key <> 'made_to_measure'
     AND key NOT LIKE '%\_version'
     AND from_value IS DISTINCT FROM to_value
$$;

-- Whether a list holds an answer someone gave (not the mark, a unit or a version).
CREATE OR REPLACE FUNCTION public.order_line_has_answers(p_fields jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(p_fields) = 'array' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_fields) AS e
     WHERE jsonb_typeof(e) = 'object'
       AND COALESCE(e ->> 'key', '') NOT IN ('', 'made_to_measure')
       AND e ->> 'key' NOT LIKE '%\_unit' AND e ->> 'key' NOT LIKE '%\_version'
       AND regexp_replace(COALESCE(e ->> 'value', ''), '^\s+|\s+$', '', 'g') <> ''
  )
$$;

-- The changes in a few words, for the order's activity.
CREATE OR REPLACE FUNCTION public.order_line_changes_text(p_changes jsonb, p_lang text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(COALESCE(string_agg(
           concat_ws(': ',
             NULLIF(CASE WHEN p_lang = 'ar'
                         THEN COALESCE(NULLIF(c ->> 'label_ar', ''), NULLIF(c ->> 'label_en', ''), c ->> 'key')
                         ELSE COALESCE(NULLIF(c ->> 'label_en', ''), NULLIF(c ->> 'label_ar', ''), c ->> 'key') END, ''),
             concat_ws(' → ', NULLIF(left(c ->> 'from', 40), ''), NULLIF(left(c ->> 'to', 40), ''))),
           CASE WHEN p_lang = 'ar' THEN '، ' ELSE '; ' END), ''), 600)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_changes) = 'array' THEN p_changes ELSE '[]'::jsonb END) AS c
$$;

CREATE OR REPLACE FUNCTION public.order_items_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb;
  v_held boolean;
  v_brand uuid;
  v_request uuid;
  v_note text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 1;
    RETURN NEW;
  END IF;

  -- The revision is the database's.
  NEW.revision := OLD.revision;
  IF NEW.custom_field_values IS NOT DISTINCT FROM OLD.custom_field_values THEN
    RETURN NEW;
  END IF;
  v_changes := public.order_line_field_changes(OLD.custom_field_values, NEW.custom_field_values);
  IF jsonb_array_length(v_changes) = 0 THEN
    RETURN NEW;
  END IF;

  v_held := EXISTS (
    SELECT 1 FROM public.purchase_order_items i
      JOIN public.purchase_orders po ON po.id = i.po_id
     WHERE i.order_item_id = OLD.id AND po.status <> 'cancelled'
  );
  -- A first answer on a line that had none is the first sheet, not a revision.
  IF NOT (public.order_line_has_answers(OLD.custom_field_values) OR v_held
          OR current_setting('boutq.line_revision', true) = 'force') THEN
    RETURN NEW;
  END IF;

  NEW.revision := OLD.revision + 1;
  v_brand := COALESCE(NEW.brand_id, (SELECT brand_id FROM public.orders WHERE id = NEW.order_id));
  v_request := NULLIF(current_setting('boutq.line_revision_request', true), '')::uuid;
  v_note := NULLIF(left(btrim(COALESCE(current_setting('boutq.line_revision_note', true), '')), 500), '');

  INSERT INTO public.order_line_revisions (
    brand_id, order_id, order_item_id, revision, changes, note, changed_by, request_id
  ) VALUES (
    v_brand, NEW.order_id, NEW.id, NEW.revision, v_changes, v_note, auth.uid(), v_request
  );

  INSERT INTO public.activity_logs (brand_id, order_id, user_id, action, message_ar, message_en, metadata)
  VALUES (
    v_brand, NEW.order_id, auth.uid(), 'order_line_revised',
    left(concat('تغيّرت تفاصيل «', left(COALESCE(NULLIF(btrim(NEW.description), ''), 'قطعة'), 80),
                '» (النسخة ', NEW.revision, '): ', public.order_line_changes_text(v_changes, 'ar'),
                CASE WHEN v_note IS NOT NULL THEN concat(' — ', v_note) END), 1000),
    left(concat('Details of "', left(COALESCE(NULLIF(btrim(NEW.description), ''), 'Piece'), 80),
                '" changed (revision ', NEW.revision, '): ', public.order_line_changes_text(v_changes, 'en'),
                CASE WHEN v_note IS NOT NULL THEN concat(' — ', v_note) END), 1000),
    jsonb_build_object('order_item_id', NEW.id, 'revision', NEW.revision)
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.order_items_revision() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_items_revision ON public.order_items;
CREATE TRIGGER trg_order_items_revision
  BEFORE INSERT OR UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_revision();

-- 2. The revision a supplier's sheet is ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purchase_order_items_sheet_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_person boolean := current_user IN ('authenticated', 'anon');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.order_item_id IS NULL THEN
      NEW.sheet_revision := NULL;
    ELSIF NEW.sheet_revision IS NULL OR v_person THEN
      SELECT revision INTO NEW.sheet_revision FROM public.order_items WHERE id = NEW.order_item_id;
    END IF;
  ELSIF v_person THEN
    NEW.sheet_revision := OLD.sheet_revision;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.purchase_order_items_sheet_revision() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_purchase_order_items_sheet_revision ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_sheet_revision
  BEFORE INSERT OR UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_order_items_sheet_revision();

-- 3. Change measurements -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.amend_order_line_details(
  p_item_id uuid,
  p_values jsonb,
  p_note text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_done public.order_line_revisions%ROWTYPE;
  v_old jsonb;
  v_known jsonb;
  v_given jsonb := '{}'::jsonb;
  v_labels jsonb := '{}'::jsonb;
  v_entry jsonb;
  v_key text;
  v_value text;
  v_values jsonb;
  v_changes jsonb;
  v_revision integer;
  v_held boolean;
  v_behind boolean;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'REQUEST_ID_REQUIRED';
  END IF;

  SELECT * INTO v_line FROM public.order_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_LINE_NOT_FOUND';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = v_line.order_id FOR UPDATE;

  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_order.brand_id)
     OR NOT public.has_permission('manage_orders') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- The same press, sent twice.
  SELECT * INTO v_done FROM public.order_line_revisions WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_done.order_item_id <> p_item_id THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    RETURN jsonb_build_object('revision', v_done.revision, 'changes', v_done.changes, 'replayed', true);
  END IF;

  SELECT * INTO v_line FROM public.order_items WHERE id = p_item_id FOR UPDATE;

  IF public.order_inventory_desired_state(v_order.status, v_order.payment_status, v_order.payment_method) = 'released' THEN
    RAISE EXCEPTION 'ORDER_CANCELLED';
  END IF;
  IF COALESCE(v_line.location, '') <> 'custom' THEN
    RAISE EXCEPTION 'NOT_MADE_TO_ORDER';
  END IF;
  -- Made already: handed over, or back from the supplier. A change now is an alteration.
  IF public.order_alteration_target(v_order.status, v_order.fulfillment_status) = 'linked_order'
     OR EXISTS (
       SELECT 1 FROM public.purchase_order_items i
         JOIN public.purchase_orders po ON po.id = i.po_id
        WHERE i.order_item_id = v_line.id AND i.purpose = 'make'
          AND po.status <> 'cancelled' AND i.received_quantity > 0
     ) THEN
    RAISE EXCEPTION 'PIECE_ALREADY_ARRIVED';
  END IF;

  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'array' OR jsonb_array_length(p_values) = 0 THEN
    RAISE EXCEPTION 'NOTHING_CHANGED';
  END IF;
  IF jsonb_array_length(p_values) > 60 THEN
    RAISE EXCEPTION 'INVALID_FIELD';
  END IF;

  v_old := CASE WHEN jsonb_typeof(v_line.custom_field_values) = 'array'
                THEN v_line.custom_field_values ELSE '[]'::jsonb END;

  -- The answers this line may hold: its own, its product's fields, the notes for the workshop.
  SELECT COALESCE(jsonb_object_agg(k.key, k.labels), '{}'::jsonb) INTO v_known
    FROM (
      SELECT DISTINCT ON (key) key, labels FROM (
        SELECT e ->> 'key' AS key,
               jsonb_build_object('label_ar', e ->> 'label_ar', 'label_en', e ->> 'label_en') AS labels, 1 AS rank
          FROM jsonb_array_elements(v_old) AS e
         WHERE jsonb_typeof(e) = 'object' AND COALESCE(e ->> 'key', '') <> ''
        UNION ALL
        SELECT f ->> 'key',
               jsonb_build_object('label_ar', f ->> 'label_ar', 'label_en', f ->> 'label_en'), 2
          FROM public.products p,
               jsonb_array_elements(CASE WHEN jsonb_typeof(p.custom_fields) = 'array'
                                         THEN p.custom_fields ELSE '[]'::jsonb END) AS f
         WHERE p.id = v_line.product_id AND jsonb_typeof(f) = 'object' AND COALESCE(f ->> 'key', '') <> ''
        UNION ALL
        SELECT 'tailoring_notes',
               jsonb_build_object('label_ar', 'ملاحظات للورشة', 'label_en', 'Notes for the workshop'), 3
      ) AS all_keys
      ORDER BY key, rank
    ) AS k;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_values) LOOP
    IF jsonb_typeof(v_entry) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_FIELD';
    END IF;
    v_key := COALESCE(v_entry ->> 'key', '');
    IF v_key = '' OR v_key = 'made_to_measure' OR char_length(v_key) > 120 OR NOT (v_known ? v_key) THEN
      RAISE EXCEPTION 'INVALID_FIELD';
    END IF;
    v_value := COALESCE(v_entry ->> 'value', '');
    IF char_length(v_value) > (CASE WHEN v_key IN ('tailoring_notes', 'custom_measurements') THEN 2000 ELSE 300 END) THEN
      RAISE EXCEPTION 'VALUE_TOO_LONG';
    END IF;
    v_given := v_given || jsonb_build_object(v_key, v_value);
  END LOOP;

  -- The line's answers with the given ones in place (an emptied one taken out), then the new ones.
  SELECT COALESCE(jsonb_agg(x.e ORDER BY x.ord), '[]'::jsonb) INTO v_values
    FROM (
      SELECT CASE WHEN v_given ? (e ->> 'key') THEN jsonb_set(e, '{value}', v_given -> (e ->> 'key')) ELSE e END AS e,
             ord
        FROM jsonb_array_elements(v_old) WITH ORDINALITY AS t(e, ord)
       WHERE NOT (jsonb_typeof(e) = 'object' AND v_given ? (e ->> 'key')
                  AND regexp_replace(v_given ->> (e ->> 'key'), '^\s+|\s+$', '', 'g') = '')
      UNION ALL
      SELECT jsonb_build_object(
               'key', g.key,
               'label_ar', COALESCE(NULLIF(v_known -> g.key ->> 'label_ar', ''), g.key),
               'label_en', COALESCE(NULLIF(v_known -> g.key ->> 'label_en', ''), g.key),
               'value', g.value),
             1000000 + row_number() OVER (ORDER BY g.key)
        FROM jsonb_each_text(v_given) AS g(key, value)
       WHERE regexp_replace(g.value, '^\s+|\s+$', '', 'g') <> ''
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_old) AS e WHERE e ->> 'key' = g.key)
    ) AS x;

  v_changes := public.order_line_field_changes(v_old, v_values);
  IF jsonb_array_length(v_changes) = 0 THEN
    RAISE EXCEPTION 'NOTHING_CHANGED';
  END IF;

  -- No stock moves: the line keeps its piece and where it comes from.
  PERFORM set_config('inventory.suppress_items_trigger', '1', true);
  PERFORM set_config('boutq.line_revision', 'force', true);
  PERFORM set_config('boutq.line_revision_request', p_request_id::text, true);
  PERFORM set_config('boutq.line_revision_note', COALESCE(p_note, ''), true);
  UPDATE public.order_items SET custom_field_values = v_values
   WHERE id = v_line.id
   RETURNING revision INTO v_revision;
  PERFORM set_config('boutq.line_revision', '', true);
  PERFORM set_config('boutq.line_revision_request', '', true);
  PERFORM set_config('boutq.line_revision_note', '', true);
  PERFORM set_config('inventory.suppress_items_trigger', '0', true);

  SELECT bool_or(true), bool_or(COALESCE(i.sheet_revision, 1) < v_revision)
    INTO v_held, v_behind
    FROM public.purchase_order_items i
    JOIN public.purchase_orders po ON po.id = i.po_id
   WHERE i.order_item_id = v_line.id AND po.status <> 'cancelled'
     AND i.received_quantity < i.quantity;

  RETURN jsonb_build_object(
    'revision', v_revision,
    'changes', v_changes,
    'with_supplier', COALESCE(v_held, false),
    'supplier_behind', COALESCE(v_behind, false)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.amend_order_line_details(uuid, jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.amend_order_line_details(uuid, jsonb, text, uuid) TO authenticated, service_role;

-- 4. The supplier was given the new sheet ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_order_line_supplier_told(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO v_line FROM public.order_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_LINE_NOT_FOUND';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = v_line.order_id FOR UPDATE;

  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_order.brand_id)
     OR NOT public.has_permission('manage_orders') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT * INTO v_line FROM public.order_items WHERE id = p_item_id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.purchase_order_items i
      JOIN public.purchase_orders po ON po.id = i.po_id
     WHERE i.order_item_id = v_line.id AND po.status <> 'cancelled'
       AND i.received_quantity < i.quantity
  ) THEN
    RAISE EXCEPTION 'NOT_WITH_SUPPLIER';
  END IF;

  UPDATE public.purchase_order_items i
     SET sheet_revision = v_line.revision
    FROM public.purchase_orders po
   WHERE po.id = i.po_id AND i.order_item_id = v_line.id AND po.status <> 'cancelled'
     AND i.received_quantity < i.quantity
     AND COALESCE(i.sheet_revision, 1) < v_line.revision;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.order_line_revisions
     SET told_supplier_at = now(), told_by = auth.uid()
   WHERE order_item_id = v_line.id AND told_supplier_at IS NULL AND revision <= v_line.revision;

  IF v_count > 0 THEN
    INSERT INTO public.activity_logs (brand_id, order_id, user_id, action, message_ar, message_en, metadata)
    VALUES (
      v_order.brand_id, v_order.id, auth.uid(), 'order_line_supplier_told',
      left(concat('أُبلغ المورّد بالنسخة ', v_line.revision, ' من «',
                  left(COALESCE(NULLIF(btrim(v_line.description), ''), 'قطعة'), 80), '»'), 1000),
      left(concat('Supplier given revision ', v_line.revision, ' of "',
                  left(COALESCE(NULLIF(btrim(v_line.description), ''), 'Piece'), 80), '"'), 1000),
      jsonb_build_object('order_item_id', v_line.id, 'revision', v_line.revision)
    );
  END IF;

  RETURN jsonb_build_object('revision', v_line.revision, 'told', v_count > 0);
END;
$$;
REVOKE ALL ON FUNCTION public.mark_order_line_supplier_told(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_order_line_supplier_told(uuid) TO authenticated, service_role;

-- 5. Where pieces are, for order staff: with the sheet each supplier has ----------------------

CREATE OR REPLACE FUNCTION public.order_workshop_pieces(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand uuid;
BEGIN
  SELECT brand_id INTO v_brand FROM public.orders WHERE id = p_order_id;
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_brand)
     OR NOT (public.has_permission('manage_orders') OR public.has_permission('view_financials')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'order_item_id', i.order_item_id,
             'item_id', i.id,
             'purpose', i.purpose,
             'quantity', i.quantity,
             'received_quantity', i.received_quantity,
             'price_pending', i.price_pending,
             'sheet_revision', COALESCE(i.sheet_revision, 1),
             'line_revision', oi.revision,
             'po_id', po.id,
             'po_number', po.po_number,
             'expected_at', po.expected_at,
             'vendor_id', v.id,
             'vendor_name', v.name,
             'vendor_phone', v.phone,
             'preferred_language', v.preferred_language)
           ORDER BY po.created_at, i.sort_order)
      FROM public.purchase_order_items i
      JOIN public.purchase_orders po ON po.id = i.po_id
      JOIN public.vendors v ON v.id = po.vendor_id
      JOIN public.order_items oi ON oi.id = i.order_item_id
     WHERE oi.order_id = p_order_id
       AND po.brand_id = v_brand
       AND po.status <> 'cancelled'
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.order_workshop_pieces(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_workshop_pieces(uuid) TO authenticated, service_role;

-- 6. The editor's save keeps its lines ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_order_items(
  p_order_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item jsonb;
  v_id uuid;
  v_kept uuid[] := ARRAY[]::uuid[];
  v_new jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND:%', p_order_id;
  END IF;

  IF auth.uid() IS NULL OR NOT public.can_access_brand(v_order.brand_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_ORDER_ITEMS';
  END IF;

  -- The stock engine's line trigger stands aside; the transition below reconciles once.
  PERFORM set_config('inventory.suppress_items_trigger', '1', true);

  -- Which lines come back: an id of this order's, once.
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_id := CASE WHEN COALESCE(v_item ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 THEN (v_item ->> 'id')::uuid END;
    IF v_id IS NOT NULL AND NOT (v_id = ANY (v_kept))
       AND EXISTS (SELECT 1 FROM public.order_items WHERE id = v_id AND order_id = p_order_id) THEN
      v_kept := v_kept || v_id;
    ELSE
      v_new := v_new || jsonb_build_array(v_item - 'id');
      CONTINUE;
    END IF;
  END LOOP;

  -- The lines taken out (a line an alteration points to is refused by its own trigger).
  DELETE FROM public.order_items
   WHERE order_id = p_order_id AND NOT (id = ANY (v_kept));

  -- The lines kept, as the editor holds them. A line keeps its id, revision, names (unless its
  -- product changed) and cost (unless one is given).
  v_kept := ARRAY[]::uuid[];
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_id := CASE WHEN COALESCE(v_item ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 THEN (v_item ->> 'id')::uuid END;
    CONTINUE WHEN v_id IS NULL OR v_id = ANY (v_kept);
    UPDATE public.order_items AS oi SET
      product_id = NULLIF(v_item->>'product_id', '')::uuid,
      variant_id = NULLIF(v_item->>'variant_id', '')::uuid,
      description = COALESCE(v_item->>'description', 'Product'),
      quantity = GREATEST(1, COALESCE((v_item->>'quantity')::integer, 1)),
      unit_price = COALESCE((v_item->>'unit_price')::numeric, 0),
      unit_cost = COALESCE(NULLIF(v_item->>'unit_cost', '')::numeric, oi.unit_cost),
      original_price = NULLIF(v_item->>'original_price', '')::numeric,
      customizations = COALESCE(v_item->'customizations', '{}'::jsonb),
      customization_total = COALESCE((v_item->>'customization_total')::numeric, 0),
      line_total = COALESCE((v_item->>'line_total')::numeric, 0),
      location = COALESCE(NULLIF(v_item->>'location', ''), 'main'),
      selected_variant = v_item->'selected_variant',
      custom_field_values = COALESCE(v_item->'custom_field_values', '[]'::jsonb),
      name_ar = CASE WHEN oi.product_id IS NOT DISTINCT FROM NULLIF(v_item->>'product_id', '')::uuid
                     THEN oi.name_ar END,
      name_en = CASE WHEN oi.product_id IS NOT DISTINCT FROM NULLIF(v_item->>'product_id', '')::uuid
                     THEN oi.name_en END
     WHERE oi.id = v_id AND oi.order_id = p_order_id;
    IF FOUND THEN
      v_kept := v_kept || v_id;
    END IF;
  END LOOP;

  -- The new lines.
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_new) LOOP
    INSERT INTO public.order_items (
      user_id,
      brand_id,
      order_id,
      product_id,
      variant_id,
      description,
      quantity,
      unit_price,
      unit_cost,
      original_price,
      customizations,
      customization_total,
      line_total,
      location,
      selected_variant,
      custom_field_values
    ) VALUES (
      COALESCE((v_item->>'user_id')::uuid, v_order.user_id, auth.uid()),
      v_order.brand_id,
      p_order_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      NULLIF(v_item->>'variant_id', '')::uuid,
      COALESCE(v_item->>'description', 'Product'),
      GREATEST(1, COALESCE((v_item->>'quantity')::integer, 1)),
      COALESCE((v_item->>'unit_price')::numeric, 0),
      NULLIF(v_item->>'unit_cost', '')::numeric,
      NULLIF(v_item->>'original_price', '')::numeric,
      COALESCE(v_item->'customizations', '{}'::jsonb),
      COALESCE((v_item->>'customization_total')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0),
      COALESCE(NULLIF(v_item->>'location', ''), 'main'),
      v_item->'selected_variant',
      COALESCE(v_item->'custom_field_values', '[]'::jsonb)
    );
  END LOOP;

  PERFORM set_config('inventory.suppress_items_trigger', '0', true);

  PERFORM public.order_inventory_transition(p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_order_items(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_order_items(uuid, jsonb) TO authenticated, service_role;
