import type { Tables } from "@/integrations/supabase/types";

/** Which orders a staff member sees: the whole brand, or only deliveries assigned to them. */
export type OrderScope = "office" | "assigned-courier";

/** A row of `ORDER_LIST_SELECT`. */
export type OrderListRow = Tables<"orders"> & {
  customers: Tables<"customers"> | null;
  order_items: Tables<"order_items">[];
  /** The booking the order was placed for (at most one), when it is an appointment. */
  bookings: Pick<
    Tables<"bookings">,
    "id" | "reference" | "status" | "event_date" | "starts_at" | "ends_at"
  >[];
};

/** A row of `ORDER_DETAIL_SELECT`. */
export type OrderDetail = OrderListRow & {
  shipping_address: Tables<"customer_addresses"> | null;
};
