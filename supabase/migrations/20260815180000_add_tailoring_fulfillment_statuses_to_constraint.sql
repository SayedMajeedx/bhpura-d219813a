-- Update orders_fulfillment_status_check constraint to include SENT_TO_TAILOR, RECEIVED_FROM_TAILOR, and PACKING.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_fulfillment_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfillment_status_check CHECK (
    upper(coalesce(fulfillment_status, 'ON_HOLD')) IN (
      'UNASSIGNED',
      'ON_HOLD',
      'NEEDS_PACKING',
      'PACKING',
      'SENT_TO_TAILOR',
      'RECEIVED_FROM_TAILOR',
      'READY_FOR_PICKUP',
      'READY_FOR_DELIVERY',
      'ASSIGNED',
      'SHIPPED',
      'OUT_FOR_DELIVERY',
      'COMPLETED',
      'DELIVERED',
      'DELIVERY_FAILED',
      'RETURNED',
      'CANCELLED'
    )
  );

COMMENT ON CONSTRAINT orders_fulfillment_status_check ON public.orders IS
  'Allowed fulfillment states across tailoring (sent/received), delivery, store pickup, and courier workflows.';
