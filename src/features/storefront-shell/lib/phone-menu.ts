/**
 * The shopper's own links in a store's menu on a phone (the header review of 2026-11-15): the
 * account, the wishlist, tracking an order and gift cards. The phone's bar has room for four
 * icons only, and before this a shopper on a phone had no way to the wishlist, and reached the
 * account only through a link at the foot of the footer.
 *
 * The store's menu settings decide (`menu_show_account`, `menu_show_orders`, Settings → Header,
 * menu and footer): they were read by a menu no page drew.
 */

export type PhoneMenuLinkKey = "account" | "sign-in" | "wishlist" | "track-order" | "gift-cards";

export type PhoneMenuLink = {
  key: PhoneMenuLinkKey;
  to:
    | "/$slug/account"
    | "/$slug/auth"
    | "/$slug/wishlist"
    | "/$slug/track-order"
    | "/$slug/gift-cards";
  ar: string;
  en: string;
};

export function phoneMenuLinks(store: {
  signedIn: boolean;
  showAccount: boolean;
  showOrders: boolean;
  servicesStore: boolean;
  sellsGiftCards: boolean;
}): PhoneMenuLink[] {
  const links: PhoneMenuLink[] = [];
  if (store.showAccount) {
    links.push(
      store.signedIn
        ? store.servicesStore
          ? {
              key: "account",
              to: "/$slug/account",
              ar: "حجوزاتي وحسابي",
              en: "My bookings & account",
            }
          : { key: "account", to: "/$slug/account", ar: "حسابي", en: "My account" }
        : { key: "sign-in", to: "/$slug/auth", ar: "تسجيل الدخول", en: "Sign in" },
    );
  }
  links.push({ key: "wishlist", to: "/$slug/wishlist", ar: "المفضلة", en: "Wishlist" });
  // Tracking needs no account (an order's number and phone open it); a services store's
  // bookings are in the account.
  if (store.showOrders && !store.servicesStore) {
    links.push({
      key: "track-order",
      to: "/$slug/track-order",
      ar: "تتبّع طلبك",
      en: "Track your order",
    });
  }
  if (store.sellsGiftCards) {
    links.push({
      key: "gift-cards",
      to: "/$slug/gift-cards",
      ar: "بطاقات الهدايا",
      en: "Gift cards",
    });
  }
  return links;
}
