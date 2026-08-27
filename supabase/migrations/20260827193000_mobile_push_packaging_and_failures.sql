CREATE OR REPLACE FUNCTION public.enqueue_mobile_packaging_low_stock_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_threshold numeric := COALESCE(NEW.reorder_level, 10); v_old_stock numeric := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.stock_quantity END;
BEGIN
  IF NEW.stock_quantity <= v_threshold AND (v_old_stock IS NULL OR v_old_stock > v_threshold) THEN
    INSERT INTO public.push_notification_events (brand_id,event_type,entity_type,entity_id,dedupe_key,title,body,target_url,payload)
    VALUES (NEW.brand_id,'low_stock','packaging_material',NEW.id,'packaging-low:'||NEW.id||':'||NEW.stock_quantity,
      'تنبيه مواد التغليف',COALESCE(NEW.name_ar,NEW.name,'مادة تغليف')||' — المتبقي '||NEW.stock_quantity,
      '/inventory',jsonb_build_object('packaging_material_id',NEW.id,'stock',NEW.stock_quantity))
    ON CONFLICT DO NOTHING;
  END IF; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS enqueue_mobile_packaging_low_stock_push ON public.packaging_materials;
CREATE TRIGGER enqueue_mobile_packaging_low_stock_push AFTER INSERT OR UPDATE OF stock_quantity,reorder_level ON public.packaging_materials
FOR EACH ROW EXECUTE FUNCTION public.enqueue_mobile_packaging_low_stock_push();

CREATE OR REPLACE FUNCTION public.enqueue_mobile_automation_failure_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'failed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'failed') THEN
    INSERT INTO public.push_notification_events (brand_id,event_type,entity_type,entity_id,dedupe_key,title,body,target_url,payload)
    VALUES (NEW.brand_id,'system_failure',TG_TABLE_NAME,NEW.id,'failure:'||TG_TABLE_NAME||':'||NEW.id,
      'تعذر تنفيذ عملية تلقائية','فشلت عملية في '||TG_TABLE_NAME||'. افتح النظام لمراجعتها.','/integrations',
      jsonb_build_object('source',TG_TABLE_NAME,'source_id',NEW.id))
    ON CONFLICT DO NOTHING;
  END IF; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS enqueue_mobile_email_failure_push ON public.order_email_events;
CREATE TRIGGER enqueue_mobile_email_failure_push AFTER INSERT OR UPDATE OF status ON public.order_email_events
FOR EACH ROW EXECUTE FUNCTION public.enqueue_mobile_automation_failure_push();
DROP TRIGGER IF EXISTS enqueue_mobile_whatsapp_failure_push ON public.whatsapp_outbox;
CREATE TRIGGER enqueue_mobile_whatsapp_failure_push AFTER INSERT OR UPDATE OF status ON public.whatsapp_outbox
FOR EACH ROW EXECUTE FUNCTION public.enqueue_mobile_automation_failure_push();

REVOKE ALL ON FUNCTION public.enqueue_mobile_packaging_low_stock_push() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enqueue_mobile_automation_failure_push() FROM PUBLIC,anon,authenticated;
