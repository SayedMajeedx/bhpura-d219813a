import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flower2, ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PHONE_SHEET,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useMoneyLabel, useStoreCurrency } from "@/hooks/use-store-currency";
import { formatMoney } from "@/lib/format";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { getFriendlyErrorMessage } from "@/lib/utils";
import {
  archiveGiftAddon,
  giftOrderQueries,
  invalidateGiftAddons,
  saveGiftAddon,
} from "@/lib/data/gift-orders";
import { addonName, addonPriceFromText, type GiftAddonRow } from "@/lib/gift-addons";
import { giftRefusal } from "@/lib/gift-order";

/**
 * What a shopper may add to a gift order (a flower bouquet, chocolates), the store's own list
 * (`gift_addons`, step two of the owner's request of 2026-11-11): each with its names, picture and
 * price, offered or not with one switch (no stock count, the owner's decision). Removing one
 * archives it, so an order that holds it keeps its name.
 */
export function GiftAddonsEditor({ brandId, lang }: { brandId: string; lang: "ar" | "en" }) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const currency = useStoreCurrency(brandId);
  const addons = useQuery(giftOrderQueries.storeAddons(brandId)).data ?? [];
  const [editing, setEditing] = useState<GiftAddonRow | "new" | null>(null);

  const failed = (error: unknown) => {
    const message = getFriendlyErrorMessage(error);
    toast.error(giftRefusal(message, lang) ?? message);
  };
  const setAvailable = async (addon: GiftAddonRow, isAvailable: boolean) => {
    try {
      await saveGiftAddon(brandId, { ...addon, imageUrl: addon.imageUrl, isAvailable });
      await invalidateGiftAddons(qc, brandId);
    } catch (error) {
      failed(error);
    }
  };
  const remove = async (addon: GiftAddonRow) => {
    const sure = await confirmDialog({
      title: isAr ? `إزالة «${addonName(addon, lang)}»؟` : `Remove “${addonName(addon, lang)}”?`,
      description: isAr
        ? "لن تظهر للعملاء بعد الآن. الطلبات التي فيها تبقى كما هي."
        : "Shoppers will no longer see it. Orders that hold it stay as they are.",
      destructive: true,
      confirmLabel: isAr ? "إزالة" : "Remove",
    });
    if (!sure) return;
    try {
      await archiveGiftAddon(addon.id);
      await invalidateGiftAddons(qc, brandId);
    } catch (error) {
      failed(error);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border-subtle bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{isAr ? "إضافات الهدية" : "Gift add-ons"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isAr
              ? "مثل باقة ورد أو شوكولاتة: يضيفها العميل إلى طلب الهدية بسعرها، ولا تخصم منها الأكواد ولا العروض."
              : "Such as a flower bouquet or chocolates: the shopper adds one to a gift order at its price; codes and offers take nothing off it."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => setEditing("new")}
        >
          <Plus className="size-4" aria-hidden />
          {isAr ? "إضافة" : "Add"}
        </Button>
      </div>

      {addons.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          {isAr ? "لا توجد إضافات بعد." : "No add-ons yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {addons.map((addon) => (
            <li key={addon.id} className="flex items-center gap-3 py-2">
              <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {addon.imageUrl ? (
                  <img src={addon.imageUrl} alt="" className="size-full object-cover" />
                ) : (
                  <Flower2 className="size-4 text-muted-foreground" aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-sm font-medium break-words" dir="auto">
                  {addonName(addon, lang)}
                </span>
                <span className="block font-mono text-xs text-muted-foreground">
                  {formatMoney(addon.price, currency, lang)}
                </span>
              </span>
              <Switch
                checked={addon.isAvailable}
                onCheckedChange={(on) => setAvailable(addon, on)}
                aria-label={
                  isAr
                    ? `${addonName(addon, lang)} متاحة للعملاء`
                    : `${addonName(addon, lang)} offered to shoppers`
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setEditing(addon)}
                aria-label={
                  isAr ? `تعديل ${addonName(addon, lang)}` : `Edit ${addonName(addon, lang)}`
                }
              >
                <Pencil className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(addon)}
                aria-label={
                  isAr ? `إزالة ${addonName(addon, lang)}` : `Remove ${addonName(addon, lang)}`
                }
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <AddonDialog
          brandId={brandId}
          lang={lang}
          addon={editing === "new" ? null : editing}
          nextSort={addons.length}
          onClose={() => setEditing(null)}
          onFailed={failed}
        />
      )}
    </div>
  );
}

function AddonDialog({
  brandId,
  lang,
  addon,
  nextSort,
  onClose,
  onFailed,
}: {
  brandId: string;
  lang: "ar" | "en";
  addon: GiftAddonRow | null;
  nextSort: number;
  onClose: () => void;
  onFailed: (error: unknown) => void;
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const id = useId();
  const moneyLabel = useMoneyLabel(lang);
  const [nameAr, setNameAr] = useState(addon?.nameAr ?? "");
  const [nameEn, setNameEn] = useState(addon?.nameEn ?? "");
  const [price, setPrice] = useState(addon ? String(addon.price) : "");
  const [imageUrl, setImageUrl] = useState(addon?.imageUrl ?? null);
  const [busy, setBusy] = useState(false);
  const parsed = addonPriceFromText(price);
  const named = Boolean(nameAr.trim() || nameEn.trim());

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      setImageUrl(await uploadPublicMedia(brandId, file, "product"));
    } catch (error) {
      onFailed(error);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (parsed === null || !named) return;
    setBusy(true);
    try {
      await saveGiftAddon(brandId, {
        id: addon?.id ?? null,
        nameAr,
        nameEn,
        imageUrl,
        price: parsed,
        isAvailable: addon?.isAvailable ?? true,
        sortOrder: addon?.sortOrder ?? nextSort,
      });
      await invalidateGiftAddons(qc, brandId);
      toast.success(isAr ? "حُفظت الإضافة" : "Add-on saved");
      onClose();
    } catch (error) {
      onFailed(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={PHONE_SHEET}>
        <DialogHeader>
          <DialogTitle>
            {addon ? (isAr ? "تعديل الإضافة" : "Edit add-on") : isAr ? "إضافة جديدة" : "New add-on"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <Flower2 className="size-6 text-muted-foreground" aria-hidden />
              )}
            </span>
            <Label
              htmlFor={`${id}-image`}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm"
            >
              <ImagePlus className="size-4" aria-hidden />
              {imageUrl
                ? isAr
                  ? "تغيير الصورة"
                  : "Change picture"
                : isAr
                  ? "إضافة صورة"
                  : "Add a picture"}
            </Label>
            <input
              id={`${id}-image`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-ar`}>{isAr ? "الاسم بالعربية" : "Name in Arabic"}</Label>
            <Input
              id={`${id}-ar`}
              dir="rtl"
              maxLength={80}
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="باقة ورد"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-en`}>{isAr ? "الاسم بالإنجليزية" : "Name in English"}</Label>
            <Input
              id={`${id}-en`}
              dir="ltr"
              maxLength={80}
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="Flower bouquet"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-price`}>
              {isAr ? `السعر (${moneyLabel})` : `Price (${moneyLabel})`}
            </Label>
            <Input
              id={`${id}-price`}
              inputMode="decimal"
              dir="ltr"
              className="max-w-40"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              aria-invalid={price !== "" && parsed === null}
            />
            {price !== "" && parsed === null && (
              <p className="text-xs text-destructive">
                {isAr
                  ? "اكتب سعرًا أكبر من صفر وحتى 10000."
                  : "Write a price above 0 and up to 10,000."}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button type="button" onClick={save} disabled={busy || parsed === null || !named}>
            {isAr ? "حفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
