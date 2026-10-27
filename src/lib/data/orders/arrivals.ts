import { supabase } from "@/integrations/supabase/client";

/**
 * New orders and bookings as they arrive, for the admin's new-order sound (`NewOrderAlert`): the
 * database's live inserts on `orders` and `bookings` (in the realtime publication since migration
 * 20261027140000), handed to `onArrival` with their table. The rows a member receives are the
 * ones the tables' own rules let them read. Returns the way to stop listening.
 */
export function subscribeToArrivals(
  brandId: string,
  onArrival: (table: "orders" | "bookings", row: Record<string, unknown>) => void,
): () => void {
  const channel = supabase.channel(`arrivals-${brandId}`);
  for (const table of ["orders", "bookings"] as const) {
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table },
      (payload: { new: Record<string, unknown> }) => {
        if (payload.new?.brand_id === brandId) onArrival(table, payload.new);
      },
    );
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
