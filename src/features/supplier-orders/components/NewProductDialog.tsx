import { useId, useMemo, useState } from "react";
import { Check, EyeOff, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  emptyNewProduct,
  newProductProblems,
  usualSizes,
  withSize,
  type NewProductForm,
} from "../lib/new-product";
import { useCreateOrderProduct } from "../hooks/use-create-order-product";

/**
 * A product the store is ordering for the first time (a new collection): its name, its sizes in
 * one tap from the sizes the store already sells, and its price if it is known. It goes into the
 * inventory hidden from the store, and joins the order.
 */
export function NewProductDialog({
  open,
  onOpenChange,
  brandId,
  startName,
  catalogVariants,
  moneyLabel,
  lang,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  /** What was typed in the product search, as the name to start from. */
  startName: string;
  catalogVariants: ReadonlyArray<{ size: string | null }>;
  moneyLabel: string;
  lang: "ar" | "en";
  onCreated: (productId: string) => void;
}) {
  const isAr = lang === "ar";
  const uid = useId();
  const [form, setForm] = useState<NewProductForm>(emptyNewProduct);
  const [typedSize, setTypedSize] = useState("");
  const [tried, setTried] = useState(false);
  const { create, saving } = useCreateOrderProduct(brandId, isAr);
  const offered = useMemo(() => usualSizes(catalogVariants), [catalogVariants]);
  const choices = [...offered, ...form.sizes.filter((s) => !offered.includes(s))];
  const problems = tried ? newProductProblems(form) : [];

  const reset = () => {
    setForm({
      ...emptyNewProduct(),
      [isAr ? "nameAr" : "nameEn"]: startName.trim(),
    });
    setTypedSize("");
    setTried(false);
  };
  const toggle = (size: string) =>
    setForm((f) => ({
      ...f,
      sizes: f.sizes.includes(size) ? f.sizes.filter((s) => s !== size) : [...f.sizes, size],
    }));
  const addTyped = () => {
    setForm((f) => ({ ...f, sizes: withSize(f.sizes, typedSize) }));
    setTypedSize("");
  };

  const save = async () => {
    setTried(true);
    if (newProductProblems(form).length > 0) return;
    const productId = await create(form);
    if (productId) {
      onCreated(productId);
      onOpenChange(false);
    }
  };

  const nameFields = [
    { key: "nameAr" as const, label: isAr ? "الاسم بالعربية" : "Name in Arabic", dir: "rtl" },
    { key: "nameEn" as const, label: isAr ? "الاسم بالإنجليزية" : "Name in English", dir: "ltr" },
  ];
  // The reader's own language first.
  if (!isAr) nameFields.reverse();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-md gap-3">
        <DialogHeader>
          <DialogTitle>{isAr ? "منتج جديد" : "New product"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? "منتج لم يدخل متجرك بعد، مثل تشكيلة جديدة طلبتها. التكلفة تكتبها في الطلبية."
              : "A product that is not in your store yet, like a new collection you ordered. Its cost goes on the order."}
          </DialogDescription>
        </DialogHeader>

        {nameFields.map((field, index) => (
          <div key={field.key} className="space-y-1">
            <Label htmlFor={`${uid}-${field.key}`}>
              {field.label}
              {index === 1 && (
                <span className="font-normal text-muted-foreground">
                  {isAr ? " (اختياري)" : " (optional)"}
                </span>
              )}
            </Label>
            <Input
              id={`${uid}-${field.key}`}
              dir={field.dir}
              value={form[field.key]}
              maxLength={200}
              onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              aria-invalid={problems.includes("name") || undefined}
              autoFocus={index === 0}
            />
          </div>
        ))}
        {problems.includes("name") && (
          <p className="text-xs text-destructive">
            {isAr ? "اكتب اسم المنتج." : "Type the product's name."}
          </p>
        )}

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{isAr ? "المقاسات" : "Sizes"}</legend>
          {choices.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {choices.map((size) => {
                const on = form.sizes.includes(size);
                return (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(size)}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm pointer-coarse:min-h-11",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    <span dir="auto">{size}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex min-w-0 gap-2">
            <Input
              aria-label={isAr ? "مقاس آخر" : "Another size"}
              value={typedSize}
              maxLength={40}
              placeholder={isAr ? "مقاس آخر" : "Another size"}
              onChange={(e) => setTypedSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTyped();
                }
              }}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addTyped}
              disabled={!typedSize.trim()}
              className="shrink-0 gap-1"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {isAr ? "إضافة" : "Add"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {form.sizes.length === 0
              ? isAr
                ? "بلا مقاس: يكون مقاساً واحداً."
                : "No size chosen: it comes in one size."
              : isAr
                ? `المقاسات المختارة: ${form.sizes.length}`
                : `${form.sizes.length} ${form.sizes.length === 1 ? "size" : "sizes"} chosen`}
          </p>
        </fieldset>

        <div className="space-y-1">
          <Label htmlFor={`${uid}-price`}>
            {isAr ? `سعر البيع (${moneyLabel})` : `Selling price (${moneyLabel})`}
            <span className="font-normal text-muted-foreground">
              {isAr ? " (اختياري)" : " (optional)"}
            </span>
          </Label>
          <Input
            id={`${uid}-price`}
            inputMode="decimal"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            aria-invalid={problems.includes("price") || undefined}
            className="max-w-40 font-mono tabular-nums"
          />
          {problems.includes("price") && (
            <p className="text-xs text-destructive">
              {isAr
                ? "اكتب السعر رقماً، أو اتركه فارغاً."
                : "Type the price as a number, or leave it empty."}
            </p>
          )}
        </div>

        <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
          <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {isAr
            ? "يُضاف للمخزون مخفياً عن المتجر بلا كمية. عند استلام الطلبية تُضاف قطعه وتكلفتها، وتُظهره أنت متى أضفت صوره."
            : "It joins your inventory hidden from the store, with no stock. Receiving the order adds its pieces and cost; you show it once its photos are in."}
        </p>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {isAr ? "إنشاء وإضافته للطلبية" : "Create and add to the order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
