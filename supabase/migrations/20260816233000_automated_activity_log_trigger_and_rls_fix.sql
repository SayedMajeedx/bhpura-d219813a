-- Migration: Activity Logs RLS Fix & Automated Order Activity Trigger
-- Created At: 2026-08-16

-- 1. Make user_id in activity_logs nullable to support system & guest activities
ALTER TABLE public.activity_logs ALTER COLUMN user_id DROP NOT NULL;

-- 2. Drop restrictive single-user policy and allow tenant brand access
DROP POLICY IF EXISTS "Users manage own activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Tenant Activity Logs Access" ON public.activity_logs;

CREATE POLICY "Tenant Activity Logs Access" ON public.activity_logs
FOR ALL USING (
  auth.uid() IS NOT NULL AND (
    brand_id IS NULL OR public.can_access_brand(brand_id)
  )
);

-- 3. Automated activity logging trigger for order creation and status changes
CREATE OR REPLACE FUNCTION public.trg_orders_auto_log_activity()
RETURNS trigger AS $$
DECLARE
  v_brand_id uuid;
  v_user_id uuid;
BEGIN
  v_brand_id := COALESCE(NEW.brand_id, OLD.brand_id);
  v_user_id := auth.uid();

  -- ON INSERT (Order Created)
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.activity_logs (
      brand_id, order_id, user_id, action, message_en, message_ar, metadata
    ) VALUES (
      v_brand_id,
      NEW.id,
      v_user_id,
      'order_created',
      'Order #' || COALESCE(NEW.invoice_number::text, substring(NEW.id::text from 1 for 8)) || ' was placed (Total: BHD ' || COALESCE(NEW.total::text, '0.000') || ')',
      'تم إنشاء الطلب رقم #' || COALESCE(NEW.invoice_number::text, substring(NEW.id::text from 1 for 8)) || ' (الإجمالي: ' || COALESCE(NEW.total::text, '0.000') || ' د.ب)',
      jsonb_build_object('status', NEW.status, 'total', NEW.total)
    );
    RETURN NEW;
  END IF;

  -- ON UPDATE: Payment Status Changed
  IF (NEW.payment_status IS DISTINCT FROM OLD.payment_status) THEN
    INSERT INTO public.activity_logs (
      brand_id, order_id, user_id, action, message_en, message_ar, metadata
    ) VALUES (
      v_brand_id,
      NEW.id,
      v_user_id,
      'payment_status_changed',
      'Payment status updated to: ' || upper(COALESCE(NEW.payment_status, 'UNPAID')),
      'تم تحديث حالة الدفع إلى: ' || upper(COALESCE(NEW.payment_status, 'غير مدفوع')),
      jsonb_build_object('old_status', OLD.payment_status, 'new_status', NEW.payment_status)
    );
  END IF;

  -- ON UPDATE: Fulfillment Status Changed
  IF (NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status) THEN
    INSERT INTO public.activity_logs (
      brand_id, order_id, user_id, action, message_en, message_ar, metadata
    ) VALUES (
      v_brand_id,
      NEW.id,
      v_user_id,
      'fulfillment_status_changed',
      'Fulfillment status updated to: ' || upper(COALESCE(NEW.fulfillment_status, 'ON_HOLD')),
      'تم تحديث حالة التوصيل إلى: ' || upper(COALESCE(NEW.fulfillment_status, 'قيد الانتظار')),
      jsonb_build_object('old_status', OLD.fulfillment_status, 'new_status', NEW.fulfillment_status)
    );
  END IF;

  -- ON UPDATE: General Order Status Changed
  IF (NEW.status IS DISTINCT FROM OLD.status) AND (NEW.fulfillment_status IS NOT DISTINCT FROM OLD.fulfillment_status) THEN
    INSERT INTO public.activity_logs (
      brand_id, order_id, user_id, action, message_en, message_ar, metadata
    ) VALUES (
      v_brand_id,
      NEW.id,
      v_user_id,
      'order_status_changed',
      'Order status updated to: ' || upper(COALESCE(NEW.status, 'PENDING')),
      'تم تحديث حالة الطلب إلى: ' || upper(COALESCE(NEW.status, 'معلق')),
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_orders_auto_log_activity ON public.orders;

CREATE TRIGGER trg_orders_auto_log_activity
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_auto_log_activity();
