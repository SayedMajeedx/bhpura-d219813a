-- The admin "Manage payment" dialog records a payment reference (a Benefit
-- transfer reference, a card slip number, ...). The column never existed, so
-- saving a payment with a reference failed with "column not found" and rolled
-- back the whole payment update (status, method and amount included).
--
-- Additive and nullable: existing rows and every other writer are unaffected.
-- Table-level grants and the existing RLS policies cover the new column.

alter table public.orders
  add column if not exists payment_reference text;

comment on column public.orders.payment_reference is
  'Staff-entered payment reference (transfer reference, card slip number). Set from the admin Manage payment dialog.';
