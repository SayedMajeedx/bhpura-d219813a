-- When an order last changed what the team has to do with it.
--
-- The "Waiting N days" mark on the orders list (`orderWaiting`) counted from the order's
-- `updated_at`, which moves on every write: a note added to an order that had sat for two weeks
-- made it look placed this morning. There was no timestamp of the stage changing to count from
-- (`delivery_status_updated_at` is set only by the courier's own function).
--
-- `stage_changed_at` is that timestamp, kept by the database alone: set when an order is
-- created, and moved when its status, its stage, its payment status or its way of reaching the
-- customer changes (each of which changes the team's next step); left alone by any other write
-- (a note, a courier, a price). A value written by a browser is ignored.
--
-- Existing orders are given the time of their latest recorded change in the activity log (the
-- database writes one for every status, stage and payment change), else `updated_at`, else
-- `created_at`. The backfill runs with the table's triggers off so it does not touch
-- `updated_at` or anything else they maintain.
--
-- Additive: one nullable column and one trigger. Tested in a real Postgres by
-- tests/orders-stage-changed-migration.test.ts.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz;

ALTER TABLE public.orders DISABLE TRIGGER USER;

UPDATE public.orders o
   SET stage_changed_at = COALESCE(
         (SELECT max(a.created_at)
            FROM public.activity_logs a
           WHERE a.order_id = o.id
             AND a.action IN (
               'fulfillment_status_changed', 'payment_status_changed', 'order_status_changed',
               'status_change', 'payment_update', 'payment_change', 'advance_change'
             )),
         o.updated_at,
         o.created_at,
         now()
       )
 WHERE o.stage_changed_at IS NULL;

ALTER TABLE public.orders ENABLE TRIGGER USER;

CREATE OR REPLACE FUNCTION public.orders_track_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_changed_at := now();
  ELSIF (NEW.status, NEW.fulfillment_status, NEW.payment_status, NEW.fulfillment_method)
        IS DISTINCT FROM
        (OLD.status, OLD.fulfillment_status, OLD.payment_status, OLD.fulfillment_method) THEN
    NEW.stage_changed_at := now();
  ELSE
    -- Any other write leaves it, whatever a browser sent.
    NEW.stage_changed_at := OLD.stage_changed_at;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.orders_track_stage_change() FROM PUBLIC, anon, authenticated;

-- Named to run last, after the triggers that settle the status from the stage.
DROP TRIGGER IF EXISTS trg_orders_zz_stage_changed ON public.orders;
CREATE TRIGGER trg_orders_zz_stage_changed
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_track_stage_change();

NOTIFY pgrst, 'reload schema';
