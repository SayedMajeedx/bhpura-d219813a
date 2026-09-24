import { AddonSlot } from "@/components/addons/AddonSlot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Minus,
  Pencil,
  Trash2,
  ImageIcon,
  Scissors,
  SlidersHorizontal,
  FileText,
} from "lucide-react";
import { formatMoney } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { resolveAllVariantAxes, variantAxisDefaultsFrom } from "@/lib/addons/addon-registry";
import { useCustomerFitPassport } from "@/features/orders/hooks/use-customer-fit-passport";
import type { Dispatch, SetStateAction } from "react";
import type { OrderItem } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";

import { OrderItemEditDialog } from "@/features/orders/components/OrderItemEditDialog";
/** One order line: image, SKU, stock, quantity and price, with its edit dialog. */
export function OrderLineCard({
  addonDefaults,
  currency,
  customQ,
  customerPassportQ,
  editingItemSheetIdx,
  editingItems,
  idx,
  it,
  items,
  lang,
  pickVariant,
  productsQ,
  setEditingItemSheetIdx,
  setItems,
  storeProfile,
  t,
  toggleCustom,
  updateItem,
  variantsQ,
  vocabulary,
}: {
  addonDefaults: ReturnType<typeof variantAxisDefaultsFrom>;
  currency: string;
  customQ: OrderDetailData["customQ"];
  customerPassportQ: ReturnType<typeof useCustomerFitPassport>;
  editingItemSheetIdx: number | null;
  editingItems: Record<number, boolean>;
  idx: number;
  it: OrderItem;
  items: OrderItem[];
  lang: ReturnType<typeof useI18n>["lang"];
  pickVariant: (idx: number, variantId: string) => void;
  productsQ: OrderDetailData["productsQ"];
  setEditingItemSheetIdx: Dispatch<SetStateAction<number | null>>;
  setItems: Dispatch<SetStateAction<OrderItem[]>>;
  storeProfile: ReturnType<typeof useAdminStoreProfile>["profile"];
  t: ReturnType<typeof useT>;
  toggleCustom: (idx: number, c: { name: string; price_delta: number }) => void;
  updateItem: (idx: number, patch: Partial<OrderItem>) => void;
  variantsQ: OrderDetailData["variantsQ"];
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
}) {
  const variant = it.variant_id
    ? (variantsQ.data ?? []).find((x: any) => x.id === it.variant_id)
    : null;
  const product =
    (variant ? productsQ.data?.find((x: any) => x.id === (variant as any).product_id) : null) ??
    (it.product_id ? (productsQ.data ?? []).find((x: any) => x.id === it.product_id) : null) ??
    (productsQ.data ?? []).find((x: any) =>
      it.description && x.name
        ? String(it.description)
            .trim()
            .toLowerCase()
            .includes(String(x.name).trim().toLowerCase()) ||
          String(x.name).trim().toLowerCase().includes(String(it.description).trim().toLowerCase())
        : false,
    );

  const getMediaUrl = (obj: any) => {
    if (!obj) return null;
    if (typeof obj.image_url === "string" && obj.image_url) return obj.image_url;
    if (typeof obj.image === "string" && obj.image) return obj.image;
    if (Array.isArray(obj.images) && obj.images[0]) return obj.images[0];
    if (Array.isArray(obj.media) && obj.media[0]) {
      const m = obj.media[0];
      return typeof m === "string" ? m : m.url || m.poster_url || null;
    }
    return null;
  };

  const imageUrl = getMediaUrl(variant) || getMediaUrl(product);
  const sku = (variant as any)?.sku || (product as any)?.sku;
  const mainStock = Number((variant as any)?.stock_main ?? 0);
  const incStock = Number((variant as any)?.stock_incubator ?? 0);
  const isAr = lang === "ar";
  return (
    <div
      key={idx}
      className="space-y-3 rounded-xl border border-border-strong bg-card p-3.5 shadow-xs transition-all"
    >
      {/* Item Thumbnail & SKU Header */}
      <div className="flex items-center gap-3 pb-2.5 border-b border-border-subtle">
        <div className="h-12 w-12 rounded-lg border bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
          {imageUrl ? (
            <img src={imageUrl} alt={it.description || ""} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate text-foreground">
            {it.description || (product?.name ?? (isAr ? "منتج مخصص" : "Custom Item"))}
          </p>
          {sku ? (
            <span className="inline-flex items-center text-xs font-mono font-medium px-2 py-0.5 rounded bg-muted/80 text-muted-foreground border border-border-subtle mt-1">
              SKU: {sku}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {it.location === "custom" || !it.variant_id
                ? vocabulary.custom_order?.[lang] || (isAr ? "طلب مخصص" : "Custom Order")
                : variant
                  ? `${variant.size || ""} ${variant.color || ""}`.trim() ||
                    (isAr ? "خيار" : "Variant")
                  : isAr
                    ? "بند مخصص"
                    : "Custom Line"}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs font-semibold gap-1.5 shrink-0 rounded-lg border border-border-strong touch-manipulation"
          onClick={() => setEditingItemSheetIdx(idx)}
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{isAr ? "تعديل المنتج" : "Product / Edit"}</span>
        </Button>
      </div>

      {/* Mobile Read-Only Compact Summary Row (< 640px) */}
      <div className="flex sm:hidden items-center justify-between gap-2 pt-1 pb-0.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <span className="bg-muted/80 text-foreground px-2.5 py-1 rounded-md border border-border-subtle">
            {it.quantity} × {formatMoney(it.unit_price, currency)}
          </span>
        </div>
        <div className="text-end">
          <span className="text-xs text-muted-foreground font-semibold block">
            {isAr ? "المجموع" : "Total"}
          </span>
          <span className="font-extrabold text-sm text-foreground">
            {formatMoney(it.line_total, currency)}
          </span>
        </div>
      </div>

      {/* Desktop Full Inline Input Grid (>= 640px) */}
      <div className="hidden sm:grid sm:grid-cols-12 gap-3">
        <div className="sm:col-span-3">
          <Label>{t("orderDetail.fromInventory")}</Label>
          <Select
            value={it.variant_id ?? "custom"}
            onValueChange={(v) => {
              if (v === "custom") {
                updateItem(idx, { variant_id: null });
              } else {
                pickVariant(idx, v);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("orderDetail.pickVariant")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">
                {vocabulary.custom_sizing?.[lang]
                  ? `${vocabulary.custom_sizing[lang]} / ${isAr ? "بدون مخزون جاهز" : "No Ready Stock"}`
                  : isAr
                    ? "طلب مخصص / بدون مخزون جاهز"
                    : "Custom Order / No Ready Stock"}
              </SelectItem>
              {(variantsQ.data ?? []).map((v: any) => {
                const p = productsQ.data?.find((x: any) => x.id === v.product_id);
                if (!p) return null;
                return (
                  <SelectItem key={v.id} value={v.id}>
                    {p.name} {v.size ? `· ${v.size}` : ""} {v.color ? `· ${v.color}` : ""} —{" "}
                    {formatMoney(v.selling_price, currency)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-3">
          <Label className="text-xs text-muted-foreground mb-1 block">
            {t("orderDetail.description")}
          </Label>
          {editingItems[idx] ? (
            <Textarea
              rows={2}
              value={it.description}
              placeholder={isAr ? "اكتب اسم أو وصف البند المخصص..." : "Enter item description..."}
              onChange={(e) => updateItem(idx, { description: e.target.value })}
              className="text-xs leading-snug rounded-xl resize-none"
            />
          ) : (
            <div className="text-xs font-medium text-foreground bg-muted/20 border border-border-subtle rounded-lg p-2.5 min-h-[42px] flex items-center">
              {it.description || (isAr ? "لا يوجد وصف إضافي" : "No additional description")}
            </div>
          )}
        </div>
        <div className="sm:col-span-2">
          <Label>{t("orderDetail.qty")}</Label>
          <div className="flex items-center rounded-lg border border-border-strong bg-background overflow-hidden h-9 shadow-2xs mt-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-8 shrink-0 rounded-none hover:bg-muted active:scale-95 text-muted-foreground hover:text-foreground"
              onClick={() =>
                updateItem(idx, {
                  quantity: Math.max(1, Number(it.quantity || 1) - 1),
                })
              }
              title={isAr ? "إنقاص الكمية" : "Decrease quantity"}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Input
              type="number"
              min={1}
              value={it.quantity}
              onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
              className="h-9 w-12 border-0 p-0 text-center font-bold text-xs focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-8 shrink-0 rounded-none hover:bg-muted active:scale-95 text-muted-foreground hover:text-foreground"
              onClick={() => updateItem(idx, { quantity: Number(it.quantity || 1) + 1 })}
              title={isAr ? "زيادة الكمية" : "Increase quantity"}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="sm:col-span-3">
          <Label className="text-xs text-muted-foreground mb-1 block">
            {t("orderDetail.unitPrice")}
          </Label>
          {editingItems[idx] ? (
            <Input
              type="number"
              step="0.001"
              value={it.unit_price}
              onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
              className="h-9 text-xs font-bold rounded-xl"
            />
          ) : (
            <div className="text-xs font-bold text-foreground bg-muted/20 border border-border-subtle rounded-lg p-2.5 min-h-[42px] flex items-center">
              {formatMoney(it.unit_price, currency)}
            </div>
          )}
          {Number(it.original_price ?? (variant as any)?.original_price ?? 0) >
            Number(it.unit_price) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {isAr ? "السعر الأصلي" : "Original"}:{" "}
              <span className="line-through">
                {formatMoney(
                  Number(it.original_price ?? (variant as any)?.original_price),
                  currency,
                )}
              </span>
              <span className="mx-1">·</span>
              {isAr ? "سعر التخفيض" : "Sale"}:{" "}
              <span className="font-medium text-foreground">
                {formatMoney(it.unit_price, currency)}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Custom Item / Specifications */}
      {!it.product_id ||
      it.location === "custom" ||
      it.variant_id === "custom" ||
      (it.custom_field_values && it.custom_field_values.length > 0) ||
      editingItems[idx] ? (
        <div className="space-y-2">
          {(!it.product_id || it.location === "custom" || it.variant_id === "custom") && (
            <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                {storeProfile.modules.made_to_order ? (
                  <Scissors className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {storeProfile.modules.made_to_order
                  ? vocabulary.custom_order?.[lang]
                    ? `${vocabulary.custom_order[lang]} / ${isAr ? "بند يدوي (لا يخصم من المخزون)" : "Manual Item (No Ready Stock Deduction)"}`
                    : isAr
                      ? "طلب مخصص / بند يدوي (لا يخصم من المخزون)"
                      : "Custom Order / Manual Item (No Ready Stock Deduction)"
                  : isAr
                    ? "بند يدوي إضافي (لا يخصم من المخزون)"
                    : "Manual Item (No Ready Stock Deduction)"}
              </span>
              <div className="flex items-center gap-2">
                {it.unit_cost != null && Number(it.unit_cost) > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                    {isAr ? "التكلفة المسجلة:" : "Cost:"} {formatMoney(it.unit_cost, currency)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md">
                    {isAr
                      ? "بدون تكلفة مسجلة (اضغط تعديل لإضافتها)"
                      : "No cost set (click edit to set)"}
                  </span>
                )}
              </div>
            </div>
          )}

          {editingItems[idx] ? (
            storeProfile.modules.made_to_order ? (
              <AddonSlot
                placement="admin.order.itemPanel"
                props={{
                  item: it,
                  isAr,
                  passport: customerPassportQ.data,
                  productCategory: product?.category,
                  productName: product?.name,
                  fitPassportEnabled: storeProfile.modules.fit_passport,
                  onChange: (patch: any) => updateItem(idx, patch),
                }}
              />
            ) : null
          ) : (
            (it.selected_variant ||
              (it.custom_field_values && it.custom_field_values.length > 0)) && (
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs space-y-2">
                <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                  {storeProfile.modules.made_to_order ? (
                    <Scissors className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                  )}
                  <span>
                    {vocabulary.customization_options?.[lang] ||
                      (isAr ? "المواصفات والخيارات" : "Specifications & Options")}
                  </span>
                </div>
                {it.selected_variant &&
                  (() => {
                    const itemAxes = resolveAllVariantAxes({
                      product,
                      addonDefaults,
                      lang: isAr ? "ar" : "en",
                    });
                    return (
                      <div className="flex flex-wrap gap-2">
                        {it.selected_variant.size && itemAxes.size.visible && (
                          <span className="inline-flex items-center gap-1 bg-background border border-border-strong px-2.5 py-1 rounded-lg text-xs font-medium text-foreground">
                            <span className="text-muted-foreground">{itemAxes.size.label}:</span>
                            <b>
                              {String(it.selected_variant?.size ?? "").includes("custom") ||
                              String(it.selected_variant?.size ?? "").includes("خاص") ||
                              String(it.selected_variant?.size ?? "").includes(
                                vocabulary.custom_order?.[lang] || "custom",
                              )
                                ? vocabulary.custom_sizing?.[lang] ||
                                  (isAr ? "قياسات خاصة" : "Custom Sizing")
                                : it.selected_variant.size}
                            </b>
                          </span>
                        )}
                        {it.selected_variant.color && itemAxes.color.visible && (
                          <span className="inline-flex items-center gap-1.5 bg-background border border-border-strong px-2.5 py-1 rounded-lg text-xs font-medium text-foreground">
                            <span className="text-muted-foreground">{itemAxes.color.label}:</span>
                            <b>{it.selected_variant.color}</b>
                          </span>
                        )}
                        {it.selected_variant.fabric && itemAxes.fabric.visible && (
                          <span className="inline-flex items-center gap-1 bg-background border border-border-strong px-2.5 py-1 rounded-lg text-xs font-medium text-foreground">
                            <span className="text-muted-foreground">{itemAxes.fabric.label}:</span>
                            <b>{it.selected_variant.fabric}</b>
                          </span>
                        )}
                      </div>
                    );
                  })()}
                {it.custom_field_values && it.custom_field_values.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-1 border-t border-border-subtle">
                    {it.custom_field_values.map((cf, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-bold text-muted-foreground">
                          {isAr
                            ? cf.label_ar || cf.label_en || cf.key
                            : cf.label_en || cf.label_ar || cf.key}
                          :{" "}
                        </span>
                        <span className="text-foreground font-medium">{cf.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      ) : (
        it.variant_id && (
          <div>
            <Label className="text-xs">{isAr ? "خصم المخزون من" : "Deduct Stock From"}</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {(
                [
                  {
                    key: "main",
                    en: `Direct Sales · Main (${mainStock})`,
                    ar: `الرئيسي (${mainStock})`,
                  },
                  {
                    key: "incubator",
                    en: `Incubator (${incStock})`,
                    ar: `الحاضنة (${incStock})`,
                  },
                ] as const
              ).map((opt) => {
                const active = it.location === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => updateItem(idx, { location: opt.key })}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-secondary"
                    }`}
                  >
                    {isAr ? opt.ar : opt.en}
                  </button>
                );
              })}
            </div>
          </div>
        )
      )}

      {Boolean(it.product_id) && (
        <div>
          <Label className="text-xs">{t("orderDetail.customizations")}</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {(customQ.data ?? [])
              .filter((c: any) => {
                const pIds = Array.isArray(c.product_ids) ? c.product_ids : [];
                if (pIds.length === 0) return true;
                return pIds.includes(it.product_id);
              })
              .map((c: any) => {
                const active = it.customizations.some((x) => x.name === c.name);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      toggleCustom(idx, {
                        name: c.name,
                        price_delta: Number(c.price_delta),
                      })
                    }
                    className={`text-xs px-2 py-1 rounded-full border ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-secondary"
                    }`}
                  >
                    {c.name} +{formatMoney(c.price_delta, currency)}
                  </button>
                );
              })}
            {(customQ.data ?? []).filter((c: any) => {
              const pIds = Array.isArray(c.product_ids) ? c.product_ids : [];
              if (pIds.length === 0) return true;
              return pIds.includes(it.product_id);
            }).length === 0 && (
              <span className="text-xs text-muted-foreground">{t("orderDetail.addonsHint")}</span>
            )}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-sm text-muted-foreground">{t("orderDetail.lineTotal")}</span>
        <div className="flex items-center gap-3">
          <span className="font-medium">{formatMoney(it.line_total, currency)}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setItems(items.filter((_, i) => i !== idx))}
            aria-label={lang === "ar" ? "حذف بند الطلب" : "Remove order item"}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Centered Modal Dialog for Web Desktop View (min-width: 768px) */}
      <OrderItemEditDialog
        currency={currency}
        customerPassportQ={customerPassportQ}
        editingItemSheetIdx={editingItemSheetIdx}
        idx={idx}
        isAr={isAr}
        it={it}
        lang={lang}
        pickVariant={pickVariant}
        product={product}
        productsQ={productsQ}
        setEditingItemSheetIdx={setEditingItemSheetIdx}
        storeProfile={storeProfile}
        t={t}
        updateItem={updateItem}
        variantsQ={variantsQ}
        vocabulary={vocabulary}
      />
    </div>
  );
}
