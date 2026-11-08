import { metaPayload } from "./meta-browser";
import { fbcFromClickId } from "./meta-conversions";
import { plainId } from "./shared";

/**
 * What the storefront's TikTok and Snapchat pixels are told, in each one's words, beside Meta's
 * (`metaPayload`). Pure: the calls are made by `trackStorefrontEvent`. Each carries the id the
 * store's server sends too, so the platform counts the event once: TikTok's `event_id`, Snapchat's
 * `client_dedup_id`, and for a purchase Snapchat's `transaction_id` (the order's id).
 */

type Event =
  | "page_view"
  | "view_item"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase"
  | "search"
  | "view_size_guide";

const TIKTOK_NAMES: Partial<Record<Event, string>> = {
  view_item: "ViewContent",
  view_size_guide: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "CompletePayment",
  search: "Search",
};

/** TikTok's call for an event: `page` for a page view, else `track` with its name and id. */
export function tiktokPixelCall(
  event: Event,
  payload: Record<string, unknown>,
  eventId: string,
):
  | { kind: "page" }
  | { kind: "track"; name: string; props: Record<string, unknown>; options: { event_id: string } }
  | null {
  if (event === "page_view") return { kind: "page" };
  const name = TIKTOK_NAMES[event];
  if (!name) return null;
  const meta = metaPayload(payload);
  const props: Record<string, unknown> = { content_type: "product" };
  if (meta.currency) props.currency = meta.currency;
  if (meta.value !== undefined) props.value = meta.value;
  if (meta.contents?.length)
    props.contents = meta.contents.map((item) => ({
      content_id: item.id,
      quantity: item.quantity,
      ...(item.item_price !== undefined ? { price: item.item_price } : {}),
    }));
  else if (meta.content_ids?.length)
    props.contents = meta.content_ids.map((id) => ({ content_id: id }));
  if (meta.order_id) props.order_id = meta.order_id;
  if (event === "search" && typeof payload.query === "string") props.query = payload.query;
  return { kind: "track", name, props, options: { event_id: eventId } };
}

const SNAP_NAMES: Partial<Record<Event, string>> = {
  page_view: "PAGE_VIEW",
  view_item: "VIEW_CONTENT",
  view_size_guide: "VIEW_CONTENT",
  add_to_cart: "ADD_CART",
  begin_checkout: "START_CHECKOUT",
  purchase: "PURCHASE",
  search: "SEARCH",
};

/** Snapchat's `track` call for an event: its name and its properties. */
export function snapPixelCall(
  event: Event,
  payload: Record<string, unknown>,
  eventId: string,
): { name: string; props: Record<string, unknown> } | null {
  const name = SNAP_NAMES[event];
  if (!name) return null;
  const meta = metaPayload(payload);
  const props: Record<string, unknown> = {};
  if (meta.currency) props.currency = meta.currency;
  if (meta.value !== undefined) props.price = meta.value;
  if (meta.content_ids?.length) props.item_ids = meta.content_ids;
  if (meta.num_items !== undefined) props.number_items = meta.num_items;
  if (event === "purchase" && meta.order_id) props.transaction_id = meta.order_id;
  else props.client_dedup_id = eventId;
  if (event === "search" && typeof payload.query === "string") props.search_string = payload.query;
  return { name, props };
}

/**
 * The click ids an ad's link carries on the page the shopper lands on: Meta's `fbclid` (in the
 * shape of its `_fbc` cookie), TikTok's `ttclid` and Snapchat's `ScCid`. Kept for the tab, so a
 * sale later in the visit still names the ad whether or not a pixel ever loaded.
 */
export function landingClicks(search: string, now: number) {
  const params = new URLSearchParams(search);
  return {
    fbc: fbcFromClickId(params.get("fbclid"), now),
    ttclid: plainId(params.get("ttclid")),
    scClickId: plainId(params.get("ScCid") ?? params.get("sccid")),
  };
}
