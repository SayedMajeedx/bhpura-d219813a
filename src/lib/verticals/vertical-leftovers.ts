import {
  resolveStoreModules,
  type StoreModuleId,
  type StoreModules,
  type StoreVertical,
} from "@/lib/store-profile";

/**
 * What a change of vertical leaves behind. The change switches a store's modules, wording,
 * add-ons and categories, but never deletes the merchant's data, so a store that moves from goods
 * to services still has its parcels, stock and delivery settings, and one that moves the other
 * way still has its bookings. This lists, from facts read off the store, each thing that stays
 * and no longer fits, so a super admin sees it before changing and the merchant can tidy it
 * after. Pure: nothing here reads or writes anything.
 */

/** Counts read off the store as it is now. */
export type LeftoverFacts = {
  /** Module overrides the store has (business_settings.store_modules). */
  moduleOverrides: Partial<StoreModules>;
  products: number;
  services: number;
  /** Orders still open (not completed, cancelled or returned), by how they are fulfilled. */
  openOrders: { delivery: number; pickup: number; digital: number; appointment: number };
  /** Bookings still to come (requested, held or confirmed). */
  openBookings: number;
  activeIncubators: number;
  openReturns: number;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  shippingZones: number;
  advancePayment: { enabled: boolean; scope: string };
};

export type LeftoverId =
  | "module-overrides"
  | "products-not-services"
  | "services-not-products"
  | "open-orders"
  | "open-bookings"
  | "incubators"
  | "returns"
  | "delivery-settings"
  | "advance-scope";

export type Leftover = {
  id: LeftoverId;
  /** How many things it is about (0 when it is a setting, not a count). */
  count: number;
  /** What the merchant can do about it. */
  advice: { ar: string; en: string };
  text: { ar: string; en: string };
};

const MODULE_NAMES: Record<StoreModuleId, { ar: string; en: string }> = {
  size_guide: { ar: "دليل المقاسات", en: "size guide" },
  fit_passport: { ar: "قياسات العميل", en: "customer measurements" },
  made_to_order: { ar: "حسب الطلب", en: "made to order" },
  bookings: { ar: "الحجوزات", en: "bookings" },
  stock: { ar: "المخزون", en: "stock" },
  incubators: { ar: "الحاضنات", en: "incubators" },
  packaging: { ar: "التغليف", en: "packaging" },
  shipping: { ar: "الشحن", en: "shipping" },
  returns: { ar: "المرتجعات", en: "returns" },
};

const list = (names: Array<{ ar: string; en: string }>, lang: "ar" | "en") =>
  names.map((n) => n[lang]).join(lang === "ar" ? "، " : ", ");

/** Advance-payment scopes that only reach goods (a delivery, or made-to-order lines). */
const GOODS_ADVANCE_SCOPES = ["delivery", "made_to_order", "made_to_order_or_delivery"];

export function planLeftovers({
  from,
  to,
  facts,
}: {
  from: StoreVertical;
  to: StoreVertical;
  facts: LeftoverFacts;
}): Leftover[] {
  const after = resolveStoreModules({ store_vertical: to });
  const out: Leftover[] = [];

  // Overrides the store set by hand keep a module on or off whatever the vertical says.
  const overridden = (Object.keys(facts.moduleOverrides) as StoreModuleId[]).filter(
    (id) =>
      typeof facts.moduleOverrides[id] === "boolean" && facts.moduleOverrides[id] !== after[id],
  );
  if (overridden.length > 0) {
    const names = overridden.map((id) => MODULE_NAMES[id]);
    out.push({
      id: "module-overrides",
      count: overridden.length,
      text: {
        ar: `للمتجر تعديلات يدوية على الوحدات (${list(names, "ar")}) تخالف النشاط الجديد وتبقى مفعّلة.`,
        en: `The store has hand-set module overrides (${list(names, "en")}) that differ from the new vertical and keep applying.`,
      },
      advice: {
        ar: "أعدها لإعدادات النشاط من بطاقة ملف المتجر في الإعدادات.",
        en: "Reset them to the vertical's defaults in Settings → Store profile.",
      },
    });
  }

  // The catalog: goods stay in a services store, services stay in a shop.
  if (after.bookings && !after.stock && facts.products > 0) {
    out.push({
      id: "products-not-services",
      count: facts.products,
      text: {
        ar: `${facts.products} منتجاً (بضاعة) ما زال في الكتالوج وسيظهر في متجر خدمات.`,
        en: `${facts.products} goods product(s) stay in the catalog and will show in a services store.`,
      },
      advice: {
        ar: "أخفِ هذه المنتجات أو احذفها من صفحة الخدمات.",
        en: "Hide or delete them from the Services page.",
      },
    });
  }
  if (!after.bookings && facts.services > 0) {
    out.push({
      id: "services-not-products",
      count: facts.services,
      text: {
        ar: `${facts.services} خدمة ما زالت في الكتالوج، ومتجر بضاعة لا يحجز المواعيد.`,
        en: `${facts.services} service(s) stay in the catalog, and a shop does not take bookings.`,
      },
      advice: {
        ar: "أخفِ الخدمات أو احذفها من المخزون.",
        en: "Hide or delete them in Inventory.",
      },
    });
  }

  // Orders still open that the new vertical has no screen for.
  const strandedOrders =
    (after.shipping ? 0 : facts.openOrders.delivery) +
    (after.stock ? 0 : facts.openOrders.pickup) +
    (after.bookings ? 0 : facts.openOrders.appointment);
  if (strandedOrders > 0) {
    out.push({
      id: "open-orders",
      count: strandedOrders,
      text: {
        ar: `${strandedOrders} طلب مفتوح بطريقة تسليم لا يعتمدها النشاط الجديد.`,
        en: `${strandedOrders} open order(s) use a way of fulfilling that the new vertical does not use.`,
      },
      advice: {
        ar: "أنهِها من صفحة الطلبات قبل التغيير أو بعده؛ تبقى متاحة هناك.",
        en: "Finish them in Orders, before or after the change; they stay reachable there.",
      },
    });
  }

  // Bookings: with the module off, the calendar is no longer in the menu.
  if (!after.bookings && facts.openBookings > 0) {
    out.push({
      id: "open-bookings",
      count: facts.openBookings,
      text: {
        ar: `${facts.openBookings} حجزاً قادماً، وصفحة الحجوزات ستختفي من القائمة.`,
        en: `${facts.openBookings} upcoming booking(s), and the Bookings page will leave the menu.`,
      },
      advice: {
        ar: "أنهِ الحجوزات القادمة أو انقلها قبل التغيير.",
        en: "Honour or move the upcoming bookings before changing.",
      },
    });
  }

  if (!after.incubators && facts.activeIncubators > 0) {
    out.push({
      id: "incubators",
      count: facts.activeIncubators,
      text: {
        ar: `${facts.activeIncubators} حاضنة فعّالة، وصفحتها ستختفي من القائمة وقد لها مستحقات.`,
        en: `${facts.activeIncubators} active incubator(s); their page will leave the menu and they may be owed money.`,
      },
      advice: {
        ar: "سوِّ مستحقاتها قبل التغيير.",
        en: "Settle what they owe before changing.",
      },
    });
  }

  if (!after.returns && facts.openReturns > 0) {
    out.push({
      id: "returns",
      count: facts.openReturns,
      text: {
        ar: `${facts.openReturns} طلب إرجاع مفتوح، وصفحة المرتجعات ستختفي من القائمة.`,
        en: `${facts.openReturns} open return request(s); the Returns page will leave the menu.`,
      },
      advice: {
        ar: "عالجها قبل التغيير.",
        en: "Process them before changing.",
      },
    });
  }

  // Settings that only mean something for goods.
  if (!after.shipping && (facts.deliveryEnabled || facts.shippingZones > 0)) {
    out.push({
      id: "delivery-settings",
      count: facts.shippingZones,
      text: {
        ar: "إعدادات التوصيل ومناطق الشحن محفوظة ولن يستعملها المتجر.",
        en: "Delivery settings and shipping zones stay saved and will not be used.",
      },
      advice: {
        ar: "لا تحتاج إلى شيء؛ تبقى للرجوع إليها.",
        en: "Nothing to do; they are kept in case you go back.",
      },
    });
  }

  if (
    facts.advancePayment.enabled &&
    GOODS_ADVANCE_SCOPES.includes(facts.advancePayment.scope) &&
    (!after.shipping || !after.stock) &&
    from !== to
  ) {
    out.push({
      id: "advance-scope",
      count: 0,
      text: {
        ar: "الدفعة المقدمة مضبوطة على نطاق يخص البضاعة (التوصيل أو حسب الطلب) ولن يطابق شيئاً هنا.",
        en: "The advance payment is set to a goods scope (delivery or made-to-order) and will match nothing here.",
      },
      advice: {
        ar: "اختر نطاق «كل طلب» من الطلبات ← الدفع.",
        en: "Choose the 'Every order' scope in Orders → Payments.",
      },
    });
  }

  return out;
}
