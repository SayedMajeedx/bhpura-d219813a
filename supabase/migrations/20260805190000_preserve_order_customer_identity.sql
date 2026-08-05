-- Preserve the customer identity that existed when an order was created.
-- Customer CRM rows are mutable and may be reused by later guest checkouts;
-- historical orders must never derive their identity solely from that row.

CREATE OR REPLACE FUNCTION public.preserve_order_customer_identity_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer public.customers%ROWTYPE;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NULLIF(trim(NEW.customer_name_snapshot), '') IS NOT NULL
     AND NULLIF(trim(NEW.customer_email_snapshot), '') IS NOT NULL
     AND NULLIF(trim(NEW.customer_phone_snapshot), '') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_customer
  FROM public.customers
  WHERE id = NEW.customer_id;

  IF FOUND THEN
    NEW.customer_name_snapshot := COALESCE(
      NULLIF(trim(NEW.customer_name_snapshot), ''),
      NULLIF(trim(v_customer.name), '')
    );
    NEW.customer_email_snapshot := COALESCE(
      NULLIF(trim(NEW.customer_email_snapshot), ''),
      NULLIF(trim(v_customer.email), '')
    );
    NEW.customer_phone_snapshot := COALESCE(
      NULLIF(trim(NEW.customer_phone_snapshot), ''),
      NULLIF(trim(v_customer.phone), '')
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS preserve_order_customer_identity_snapshot ON public.orders;
CREATE TRIGGER preserve_order_customer_identity_snapshot
BEFORE INSERT OR UPDATE OF customer_id ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.preserve_order_customer_identity_snapshot();

REVOKE ALL ON FUNCTION public.preserve_order_customer_identity_snapshot() FROM PUBLIC;

COMMENT ON FUNCTION public.preserve_order_customer_identity_snapshot() IS
  'Fills missing order customer snapshots before persistence so later CRM deduplication or edits cannot rewrite historical order identity.';

-- Deliberately do not backfill historical NULL snapshots from current customer
-- rows: those rows may already have been overwritten, as seen in order #1085.
-- Recover affected historical snapshots only from authoritative backups/audit data.
