-- New bookings reach the admin as they arrive, for the new-order sound (the owner's decision of
-- 2026-10-27: it sounds for a shopper's new orders and bookings). Orders were already in the
-- realtime publication; a member receives only the rows the bookings table's own rules let them
-- read.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END
$$;
