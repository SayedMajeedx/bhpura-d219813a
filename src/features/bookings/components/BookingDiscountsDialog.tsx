import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { catalogQueries } from "@/lib/data/catalog";
import {
  bookingDiscountsQueries,
  deleteDiscountRule,
  invalidateBookingDiscounts,
  saveDiscountRule,
  setDiscountRuleActive,
  type DiscountRuleRow,
} from "@/lib/data/booking-discounts";
import {
  DISCOUNT_PRESETS,
  describeDiscountRule,
  discountFormColumns,
  discountFormError,
  discountFormFrom,
  discountName,
  EMPTY_DISCOUNT_FORM,
  type DiscountRuleForm,
} from "@/lib/bookings/discounts";
import { weekdayNames } from "@/lib/bookings/format";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

/** One rule's form: its name, value, the days it covers, the services and the dates. */
function RuleForm({
  initial,
  isAr,
  services,
  saving,
  onSave,
  onCancel,
}: {
  initial: DiscountRuleForm;
  isAr: boolean;
  services: Array<{ id: string; name: string }>;
  saving: boolean;
  onSave: (form: DiscountRuleForm) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const patch = (next: Partial<DiscountRuleForm>) =>
    setForm((current) => ({ ...current, ...next }));
  const problem = form.value ? discountFormError(form, isAr) : null;
  const days = weekdayNames(isAr, 0);
  const toggle = (list: Array<string | number>, item: string | number) =>
    list.includes(item) ? list.filter((other) => other !== item) : [...list, item];

  const preview = discountFormError(form, isAr)
    ? null
    : describeDiscountRule(
        {
          ...discountFormColumns(form),
          id: "preview",
          kind: form.kind,
        },
        isAr,
      );

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!discountFormError(form, isAr)) onSave(form);
      }}
    >
      {initial === EMPTY_DISCOUNT_FORM && (
        <div className="flex flex-wrap gap-2" aria-label={isAr ? "بدايات سريعة" : "Quick starts"}>
          {DISCOUNT_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => patch(preset.form)}
            >
              {isAr ? preset.label.ar : preset.label.en}
            </Button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="discount-name-en">{isAr ? "الاسم بالإنجليزية" : "Name (English)"}</Label>
          <Input
            id="discount-name-en"
            value={form.name_en}
            maxLength={80}
            onChange={(event) => patch({ name_en: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="discount-name-ar">{isAr ? "الاسم بالعربية" : "Name (Arabic)"}</Label>
          <Input
            id="discount-name-ar"
            dir="rtl"
            value={form.name_ar}
            maxLength={80}
            onChange={(event) => patch({ name_ar: event.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label={isAr ? "نوع الخصم" : "Discount type"} className="flex gap-2">
          {(["percent", "fixed"] as const).map((kind) => (
            <Button
              key={kind}
              type="button"
              size="sm"
              variant="chip"
              aria-pressed={form.kind === kind}
              className={cn(
                "border border-border",
                form.kind === kind && "border-primary bg-primary/10 text-foreground",
              )}
              onClick={() => patch({ kind })}
            >
              {kind === "percent"
                ? isAr
                  ? "نسبة %"
                  : "Percent %"
                : isAr
                  ? "مبلغ ثابت"
                  : "Fixed amount"}
            </Button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="discount-value">{isAr ? "قيمة الخصم" : "Discount"}</Label>
          <Input
            id="discount-value"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.001"
            dir="ltr"
            className="w-28"
            value={form.value}
            onChange={(event) => patch({ value: event.target.value })}
          />
        </div>
      </div>

      <fieldset className="space-y-2 rounded-xl border border-border p-3">
        <legend className="px-1 text-xs font-semibold text-muted-foreground">
          {isAr
            ? "متى ينطبق (عدد الأيام بين الحجز والمناسبة)"
            : "When (days between booking and event)"}
        </legend>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="discount-min">{isAr ? "من" : "From"}</Label>
            <Input
              id="discount-min"
              type="number"
              inputMode="numeric"
              min={0}
              max={730}
              dir="ltr"
              className="w-24"
              value={form.min_days}
              onChange={(event) => patch({ min_days: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discount-max">
              {isAr ? "إلى (فارغ = بلا حد)" : "To (empty = no limit)"}
            </Label>
            <Input
              id="discount-max"
              type="number"
              inputMode="numeric"
              min={0}
              max={730}
              dir="ltr"
              className="w-24"
              value={form.max_days}
              onChange={(event) => patch({ max_days: event.target.value })}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "مثال: من 0 إلى 1 = حجز اللحظة الأخيرة. من 30 فأكثر = حجز مبكر."
            : "For example 0 to 1 is a last-minute booking; 30 and up is booking early."}
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted-foreground">
          {isAr
            ? "أيام المناسبة (اتركها فارغة لكل الأيام)"
            : "Event days (leave empty for every day)"}
        </legend>
        <div className="flex flex-wrap gap-2">
          {days.map((name, index) => (
            <Button
              key={name}
              type="button"
              size="xs"
              variant="chip"
              aria-pressed={form.weekdays.includes(index)}
              className={cn(
                "border border-border",
                form.weekdays.includes(index) && "border-primary bg-primary/10 text-foreground",
              )}
              onClick={() => patch({ weekdays: toggle(form.weekdays, index) as number[] })}
            >
              {name}
            </Button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted-foreground">
          {isAr ? "الخدمات (اتركها فارغة لكل الخدمات)" : "Services (leave empty for all)"}
        </legend>
        <div className="grid max-h-40 gap-1.5 overflow-auto sm:grid-cols-2">
          {services.map((service) => (
            <Label key={service.id} className="flex items-center gap-2 text-sm font-normal">
              <Checkbox
                checked={form.product_ids.includes(service.id)}
                onCheckedChange={() =>
                  patch({ product_ids: toggle(form.product_ids, service.id) as string[] })
                }
              />
              <span className="min-w-0 truncate">{service.name}</span>
            </Label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="discount-from">{isAr ? "يُحجز من تاريخ" : "Can be booked from"}</Label>
          <Input
            id="discount-from"
            type="date"
            dir="ltr"
            value={form.valid_from}
            onChange={(event) => patch({ valid_from: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="discount-to">{isAr ? "حتى تاريخ" : "Until"}</Label>
          <Input
            id="discount-to"
            type="date"
            dir="ltr"
            value={form.valid_to}
            onChange={(event) => patch({ valid_to: event.target.value })}
          />
        </div>
      </div>

      <Label className="flex items-center gap-2 text-sm font-normal">
        <Checkbox
          checked={form.is_active}
          onCheckedChange={(checked) => patch({ is_active: checked === true })}
        />
        {isAr ? "العرض مفعّل" : "Offer is on"}
      </Label>

      {preview && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-foreground">{preview}</p>
      )}
      {problem && (
        <p className="text-xs font-semibold text-destructive" role="alert">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || Boolean(discountFormError(form, isAr))}>
          {isAr ? "حفظ العرض" : "Save offer"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {isAr ? "رجوع" : "Back"}
        </Button>
      </div>
    </form>
  );
}

/**
 * The store's booking offers: discounts for booking last minute, within a
 * week, well ahead, or on certain days. The database applies the best one
 * when a booking is made; the storefront shows them.
 */
export function BookingDiscountsDialog({
  page,
  open,
  onOpenChange,
}: {
  page: BookingsPage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isAr, brand } = page;
  const qc = useQueryClient();
  const rules = useQuery(bookingDiscountsQueries.list(brand.id)).data ?? [];
  const products = useQuery(catalogQueries.products(brand.id)).data ?? [];
  const services = products
    .filter((product) => product.is_active)
    .map((product) => ({
      id: product.id,
      name: (isAr ? product.name_ar || product.name : product.name_en || product.name) ?? "",
    }));
  const [editing, setEditing] = useState<{ id: string | null; form: DiscountRuleForm } | null>(
    null,
  );

  const done = (message: string) => async () => {
    await invalidateBookingDiscounts(qc, brand.id);
    toast.success(message);
  };
  const onError = (error: Error) => toast.error(error.message);
  const save = useMutation({
    mutationFn: ({ id, form }: { id: string | null; form: DiscountRuleForm }) =>
      saveDiscountRule(brand.id, id, discountFormColumns(form)),
    onSuccess: async () => {
      await done(isAr ? "تم حفظ العرض" : "Offer saved")();
      setEditing(null);
    },
    onError,
  });
  const toggleActive = useMutation({
    mutationFn: (rule: DiscountRuleRow) =>
      setDiscountRuleActive(brand.id, rule.id, !rule.is_active),
    onSuccess: done(isAr ? "تم التحديث" : "Updated"),
    onError,
  });
  const remove = useMutation({
    mutationFn: (rule: DiscountRuleRow) => deleteDiscountRule(brand.id, rule.id),
    onSuccess: done(isAr ? "تم حذف العرض" : "Offer deleted"),
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-4 text-primary" aria-hidden="true" />
            {isAr ? "عروض الحجز" : "Booking offers"}
          </DialogTitle>
          <DialogDescription>
            {isAr
              ? "خصومات حسب موعد الحجز: اللحظة الأخيرة، خلال أسبوع، أو مبكراً. يُطبَّق أفضل عرض واحد على الحجز."
              : "Discounts by when a booking is made: last minute, within a week, or well ahead. The best matching offer applies to a booking."}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <RuleForm
            initial={editing.form}
            isAr={isAr}
            services={services}
            saving={save.isPending}
            onSave={(form) => save.mutate({ id: editing.id, form })}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div className="space-y-3">
            {rules.length === 0 && (
              <p className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
                {isAr ? "لا توجد عروض بعد." : "No offers yet."}
              </p>
            )}
            <ul className="space-y-2">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3",
                    !rule.is_active && "opacity-60",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {discountName(rule, isAr)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {describeDiscountRule(rule, isAr)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="flex items-center gap-1.5 px-2 text-xs font-normal">
                      <Checkbox
                        checked={rule.is_active}
                        disabled={toggleActive.isPending}
                        onCheckedChange={() => toggleActive.mutate(rule)}
                      />
                      {isAr ? "مفعّل" : "On"}
                    </Label>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label={isAr ? "تعديل" : "Edit"}
                      onClick={() => setEditing({ id: rule.id, form: discountFormFrom(rule) })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive"
                      aria-label={isAr ? "حذف" : "Delete"}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(rule)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              className="gap-1.5"
              onClick={() => setEditing({ id: null, form: EMPTY_DISCOUNT_FORM })}
            >
              <Plus className="size-4" />
              {isAr ? "إضافة عرض" : "Add an offer"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
