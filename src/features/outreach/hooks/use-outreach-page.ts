import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import { useAddons } from "@/components/addons/AddonsProvider";
import { getStorefrontUrl } from "@/lib/storefront-url";
import { formatMoney } from "@/lib/format";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";
import { describeVariantAxes, storeAxisDefaults } from "@/lib/variant-axes";
import { combinedLoadState } from "@/components/os/os-load-failed-state";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { catalogQueries } from "@/lib/data/catalog";
import { customersQueries } from "@/lib/data/customers";
import { abandonedCartsQueries } from "@/lib/data/abandoned-carts";
import { invalidateLeads, leadsQueries, setBackInStockTold } from "@/lib/data/leads";
import {
  invalidateOutreach,
  outreachQueries,
  recordOutreach,
  setCustomerConsent,
} from "@/lib/data/outreach";
import { productName } from "@/features/leads/lib/leads";
import {
  outreachToday,
  type OutreachCard,
  type OutreachCart,
  type OutreachLogEntry,
  type OutreachProduct,
  type OutreachReason,
} from "@/features/outreach/lib/outreach";
import {
  REASON_LABELS,
  outreachMessage,
  type MessageContext,
} from "@/features/outreach/lib/outreach-messages";

/** Everything the page holds: the reads, today's list, each card's draft, and the actions. */
export function useOutreachPage(lang: "ar" | "en", now = Date.now()) {
  const brand = useBrand();
  const brandId = brand.id;
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const { addons } = useAddons();

  const customersQ = useQuery(customersQueries.audience(brandId));
  const ordersQ = useQuery(outreachQueries.orders(brandId));
  const logQ = useQuery(outreachQueries.log(brandId));
  const cartsQ = useQuery(abandonedCartsQueries.carts(brandId));
  const requestsQ = useQuery(leadsQueries.backInStock(brandId));
  const productsQ = useQuery(catalogQueries.products(brandId));
  const variantsQ = useQuery(catalogQueries.variants(brandId));
  const settingsQ = useQuery(businessSettingsQueries.detail(brandId));
  const queries = [customersQ, ordersQ, logQ, cartsQ, requestsQ, productsQ, variantsQ];

  // The day is fixed while the page is open, so the list does not move under the reader.
  const [today] = useState(now);
  const lists = useMemo(
    () =>
      outreachToday({
        now: today,
        customers: customersQ.data ?? [],
        orders: ordersQ.data ?? [],
        carts: (cartsQ.data ?? []) as unknown as OutreachCart[],
        requests: requestsQ.data ?? [],
        products: (productsQ.data ?? []) as unknown as OutreachProduct[],
        variants: variantsQ.data ?? [],
        log: (logQ.data ?? []) as OutreachLogEntry[],
      }),
    [
      today,
      customersQ.data,
      ordersQ.data,
      cartsQ.data,
      requestsQ.data,
      productsQ.data,
      variantsQ.data,
      logQ.data,
    ],
  );

  const settings = settingsQ.data;
  const storeName =
    settings?.business_name ||
    (isAr ? brand.name_ar || brand.name_en : brand.name_en || brand.name_ar) ||
    brand.slug;
  const currency = settings?.currency ?? null;
  const vertical = settings?.store_vertical ?? null;

  const ctx: MessageContext = useMemo(() => {
    const absolute = (path: string) => {
      const link = getStorefrontUrl(brand, path);
      return link.startsWith("http") ? link : `${window.location.origin}${link}`;
    };
    const defaults = storeAxisDefaults(addons, vertical);
    return {
      storeName,
      productLink: (id) => absolute(`/product/${id}`),
      cartLink: (token) => absolute(`/checkout?recover=${encodeURIComponent(token)}`),
      storeLink: absolute(""),
      sizeLabel: (l) =>
        describeVariantAxes({ variants: [{ size: "x" }], addonDefaults: defaults, lang: l }).find(
          (axis) => axis.field === "size",
        )?.label ?? (l === "ar" ? "المقاس" : "Size"),
      money: (amount, cur, l) => formatMoney(amount, cur || currency || "BHD", l),
      productName: (product, l) => productName(product, l),
    };
  }, [brand, addons, vertical, storeName, currency]);

  // Each card's draft: the language chosen for it and the text as edited.
  const [drafts, setDrafts] = useState<Record<string, { lang?: "ar" | "en"; text?: string }>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const langOf = useCallback((card: OutreachCard) => drafts[card.key]?.lang ?? card.lang, [drafts]);
  const textOf = useCallback(
    (card: OutreachCard) => drafts[card.key]?.text ?? outreachMessage(card, langOf(card), ctx),
    [drafts, langOf, ctx],
  );
  const setLang = (card: OutreachCard, value: "ar" | "en") =>
    setDrafts((all) => ({ ...all, [card.key]: { lang: value } }));
  const setText = (card: OutreachCard, text: string) =>
    setDrafts((all) => ({ ...all, [card.key]: { ...all[card.key], text } }));

  const summary = (card: OutreachCard, kind: "sent" | "skipped") => {
    const who = card.name?.trim() || `+${card.contact}`;
    const label = REASON_LABELS[card.reason];
    return kind === "sent"
      ? {
          ar: `رسالة واتساب إلى ${who}: ${label.ar}`,
          en: `WhatsApp message to ${who}: ${label.en}`,
        }
      : { ar: `أُجّلت رسالة ${who}: ${label.ar}`, en: `Put away for a week, ${who}: ${label.en}` };
  };

  const ref = (card: OutreachCard) => card.key.slice(card.key.indexOf(":") + 1);

  const keep = async (card: OutreachCard, kind: "sent" | "skipped", reason: OutreachReason) => {
    setBusyKey(card.key);
    try {
      await recordOutreach(brandId, {
        contact: card.contact,
        reason,
        kind,
        customerId: card.customerId,
        ref: ref(card),
        summary: summary(card, kind),
      });
      if (kind === "sent" && card.detail.reason === "back_in_stock") {
        await setBackInStockTold(brandId, [card.detail.requestId]);
        await invalidateLeads(qc, brandId);
      }
      toast.success(
        kind === "sent"
          ? isAr
            ? "سُجّلت الرسالة. لن يظهر هذا العميل قبل أسبوع."
            : "Recorded. This client won't come up again for a week."
          : isAr
            ? "أُجّل لأسبوع."
            : "Put away for a week.",
      );
    } catch (error) {
      toast.error(isAr ? "تعذّر حفظ ذلك." : "That was not saved.", {
        description: getFriendlyErrorMessage(error),
      });
    } finally {
      await invalidateOutreach(qc, brandId);
      setBusyKey(null);
    }
  };

  /** Opens the chat with the message, then records it. The chat opens first: a browser blocks a
   *  window opened after a wait. */
  const send = (card: OutreachCard) => {
    const chat = whatsappChatUrl(card.contact);
    if (!chat) return;
    window.open(
      `${chat}?text=${encodeURIComponent(textOf(card))}`,
      "_blank",
      "noopener,noreferrer",
    );
    void keep(card, "sent", card.reason);
  };

  const skip = (card: OutreachCard) => void keep(card, "skipped", card.reason);

  /** The client already said yes (in the shop, in a chat): recorded without a message. */
  const recordAgreed = async (card: OutreachCard) => {
    if (!card.customerId) return;
    setBusyKey(card.key);
    try {
      await setCustomerConsent(brandId, { id: card.customerId, name: card.name }, true);
      toast.success(isAr ? "سُجّلت موافقته." : "Their consent is recorded.");
    } catch (error) {
      toast.error(isAr ? "تعذّر حفظ ذلك." : "That was not saved.", {
        description: getFriendlyErrorMessage(error),
      });
    } finally {
      await invalidateOutreach(qc, brandId);
      setBusyKey(null);
    }
  };

  return {
    isAr,
    lang,
    storeName,
    loadState: combinedLoadState(queries),
    queries,
    today: lists.today,
    askConsent: lists.askConsent,
    ctx,
    langOf,
    textOf,
    setLang,
    setText,
    busyKey,
    send,
    skip,
    recordAgreed,
  };
}

export type OutreachPageState = ReturnType<typeof useOutreachPage>;
