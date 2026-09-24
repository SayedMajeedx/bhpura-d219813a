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
import { Plus, Minus, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { useCustomerFitPassport } from "@/features/orders/hooks/use-customer-fit-passport";
import type { Dispatch, SetStateAction } from "react";
import type { OrderItem } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";

/** Edit one order line: variant, description, quantity, price, cost and specs. */
export function OrderItemEditDialog({
  currency,
  customerPassportQ,
  editingItemSheetIdx,
  idx,
  isAr,
  it,
  lang,
  pickVariant,
  product,
  productsQ,
  setEditingItemSheetIdx,
  storeProfile,
  t,
  updateItem,
  variantsQ,
  vocabulary,
}: {
  currency: string;
  customerPassportQ: ReturnType<typeof useCustomerFitPassport>;
  editingItemSheetIdx: number | null;
  idx: number;
  isAr: boolean;
  it: OrderItem;
  lang: ReturnType<typeof useI18n>["lang"];
  pickVariant: (idx: number, variantId: string) => void;
  product: any;
  productsQ: OrderDetailData["productsQ"];
  setEditingItemSheetIdx: Dispatch<SetStateAction<number | null>>;
  storeProfile: ReturnType<typeof useAdminStoreProfile>["profile"];
  t: ReturnType<typeof useT>;
  updateItem: (idx: number, patch: Partial<OrderItem>) => void;
  variantsQ: OrderDetailData["variantsQ"];
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
}) {
  return (
    <Dialog
      open={editingItemSheetIdx === idx}
      onOpenChange={(open) => setEditingItemSheetIdx(open ? idx : null)}
    >
      <DialogContent className="sm:max-w-[560px] w-[95vw] rounded-2xl p-6 font-sans border border-border-strong bg-card shadow-2xl space-y-5">
        <DialogHeader className="text-start pb-3 border-b border-border-subtle pe-8 ps-0 space-y-1">
          <DialogTitle className="text-lg font-extrabold text-foreground flex items-center gap-2">
            <Pencil className="h-4.5 w-4.5 text-primary shrink-0" />
            <span>{isAr ? "تعديل المنتج" : "Edit Product"}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground truncate">
            {it.description || (product?.name ?? (isAr ? "منتج مخصص" : "Custom Item"))}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Inventory Variant Picker */}
          <div>
            <Label className="text-xs font-semibold">{t("orderDetail.fromInventory")}</Label>
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
              <SelectTrigger className="mt-1.5 h-10 rounded-xl">
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

          {/* Description */}
          <div>
            <Label className="text-xs font-semibold">{t("orderDetail.description")}</Label>
            <Textarea
              rows={2}
              value={it.description}
              onChange={(e) => updateItem(idx, { description: e.target.value })}
              className="mt-1.5 text-xs rounded-xl resize-none"
            />
          </div>

          {/* Quantity, Unit Price & Product Cost (COGS) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-semibold">{t("orderDetail.qty")}</Label>
              <div className="flex items-center rounded-xl border border-border bg-background overflow-hidden h-10 mt-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() =>
                    updateItem(idx, {
                      quantity: Math.max(1, Number(it.quantity || 1) - 1),
                    })
                  }
                  aria-label={isAr ? "إنقاص" : "Decrease"}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) =>
                    updateItem(idx, {
                      quantity: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="h-10 border-0 text-center font-bold text-sm bg-transparent"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() =>
                    updateItem(idx, {
                      quantity: Number(it.quantity || 1) + 1,
                    })
                  }
                  aria-label={isAr ? "إضافة" : "Add"}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">{t("orderDetail.unitPrice")}</Label>
              <Input
                type="number"
                step="0.001"
                value={it.unit_price}
                onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                className="mt-1.5 h-10 text-sm font-bold rounded-xl"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">
                {isAr ? "تكلفة المنتج (COGS)" : "Product Cost (COGS)"}
              </Label>
              <Input
                type="number"
                step="0.001"
                placeholder="0.000"
                value={it.unit_cost ?? ""}
                onChange={(e) =>
                  updateItem(idx, {
                    unit_cost: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="mt-1.5 h-10 text-sm rounded-xl"
              />
            </div>
          </div>

          {/* Made-To-Order & Tailoring Specs Customizer */}
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
        </div>

        <DialogFooter className="flex flex-row justify-end items-center gap-2.5 pt-3 border-t border-border-subtle">
          <Button
            type="button"
            variant="outline"
            className="h-10 px-4 rounded-xl text-xs font-semibold"
            onClick={() => setEditingItemSheetIdx(null)}
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            type="button"
            className="h-10 px-5 font-bold text-xs rounded-xl bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
            onClick={() => setEditingItemSheetIdx(null)}
          >
            {isAr ? "حفظ التعديلات" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
