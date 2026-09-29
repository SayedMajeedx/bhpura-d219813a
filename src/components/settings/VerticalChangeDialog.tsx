import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAddon } from "@/lib/addons/addon-registry";
import type { AddonId } from "@/lib/addons/addon-types";
import {
  MODULE_LABELS,
  STORE_MODULES,
  VERTICAL_LABELS,
  type StoreVertical,
} from "@/lib/store-profile";
import {
  changeVertical,
  invalidateAfterVerticalChange,
  verticalQueries,
} from "@/lib/data/verticals";

const REASON_MIN = 5;

/** Readable messages for the change's known refusals. */
function changeError(message: string, isAr: boolean) {
  if (message.includes("STORE_VERTICAL_SUPER_ADMIN_ONLY")) {
    return isAr
      ? "تغيير النشاط متاح لفريق Boutq فقط."
      : "Only Boutq can change a store's vertical.";
  }
  if (message.includes("VERTICAL_UNCHANGED")) {
    return isAr ? "المتجر على هذا النشاط بالفعل." : "The store is already on this vertical.";
  }
  return isAr
    ? "تعذّر تغيير النشاط. لم يتغيّر شيء."
    : "Could not change the vertical. Nothing changed.";
}

/**
 * A super admin changes a store's vertical: what the change will do (read
 * from the store now, on the server), the add-ons to switch off and whether
 * categories follow, then a reason. Applied in one audited step.
 */
export function VerticalChangeDialog({
  brandId,
  from,
  to,
  isAr,
  onClose,
  onChanged,
}: {
  brandId: string;
  from: StoreVertical;
  /** The vertical to change to; the dialog is open while it is set. */
  to: StoreVertical | null;
  isAr: boolean;
  onClose: () => void;
  onChanged: (vertical: StoreVertical) => void;
}) {
  const qc = useQueryClient();
  const [syncCategories, setSyncCategories] = useState(true);
  const [disable, setDisable] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const preview = useQuery(verticalQueries.preview(brandId, to, syncCategories));
  const plan = preview.data;
  const lang = isAr ? "ar" : "en";
  const addonName = (id: string) => {
    try {
      return getAddon(id as AddonId).name[lang];
    } catch {
      return id;
    }
  };

  const change = useMutation({
    mutationFn: () =>
      changeVertical({
        brandId,
        vertical: to!,
        reason: reason.trim(),
        disableAddons: disable,
        syncCategories,
      }),
    onSuccess: async () => {
      await invalidateAfterVerticalChange(qc, brandId);
      toast.success(isAr ? "تم تغيير نشاط المتجر وتسجيله" : "Store vertical changed and recorded");
      onChanged(to!);
    },
    onError: (error: Error) => toast.error(changeError(error.message, isAr)),
  });

  const changedModules = plan
    ? STORE_MODULES.filter((id) => plan.modules.before[id] !== plan.modules.after[id])
    : [];
  const reasonOk = reason.trim().length >= REASON_MIN;
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  return (
    <Dialog open={to !== null} onOpenChange={(open) => !open && !change.isPending && onClose()}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            {isAr ? "تغيير نشاط المتجر" : "Change store vertical"}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5">
            <span>{VERTICAL_LABELS[from][lang]}</span>
            <Arrow className="size-3.5" aria-hidden="true" />
            <span className="font-semibold text-foreground">
              {to ? VERTICAL_LABELS[to][lang] : ""}
            </span>
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading || !plan ? (
          <p className="flex items-center gap-2 py-6 text-xs text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />
            {isAr ? "جارٍ حساب أثر التغيير…" : "Working out what the change does…"}
          </p>
        ) : (
          <div className="space-y-4 text-xs">
            <section className="space-y-1.5">
              <h3 className="font-semibold text-foreground">
                {isAr ? "إضافات ستُثبَّت" : "Add-ons to install"}
              </h3>
              {plan.install.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {plan.install.map((id) => (
                    <li key={id} className="rounded-md bg-primary/10 px-2 py-1 text-primary">
                      {addonName(id)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  {isAr
                    ? "كل ما يحتاجه النشاط الجديد مثبت."
                    : "Everything the new vertical needs is installed."}
                </p>
              )}
            </section>

            {plan.disableCandidates.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="font-semibold text-foreground">
                  {isAr
                    ? "إضافات يمكن إيقافها (تبقى بياناتها)"
                    : "Add-ons you may switch off (data kept)"}
                </h3>
                {plan.disableCandidates.map((id) => (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2"
                  >
                    <Checkbox
                      checked={disable.includes(id)}
                      onCheckedChange={(checked) =>
                        setDisable((current) =>
                          checked ? [...current, id] : current.filter((other) => other !== id),
                        )
                      }
                    />
                    <span>{addonName(id)}</span>
                  </label>
                ))}
              </section>
            )}

            <section className="space-y-1.5">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2">
                <Checkbox
                  checked={syncCategories}
                  onCheckedChange={(checked) => setSyncCategories(Boolean(checked))}
                  className="mt-0.5"
                />
                <span className="font-semibold text-foreground">
                  {isAr ? "تحديث الأقسام للنشاط الجديد" : "Update categories for the new vertical"}
                </span>
              </label>
              {syncCategories && plan.categories === null && (
                <p className="text-muted-foreground">
                  {isAr
                    ? "أقسام هذا المتجر محمية وتبقى كما هي."
                    : "This store's categories are protected and stay as they are."}
                </p>
              )}
              {plan.categories && (
                <div className="space-y-1 text-muted-foreground">
                  <p>
                    {isAr ? "ستُضاف: " : "Added: "}
                    {plan.categories.add.map((c) => c[isAr ? "name_ar" : "name_en"]).join("، ") ||
                      (isAr ? "لا شيء" : "none")}
                  </p>
                  <p>
                    {isAr ? "ستُحذف (بلا منتجات): " : "Removed (no products): "}
                    {plan.categories.remove
                      .map((c) => (isAr ? c.name_ar : c.name_en) || c.slug)
                      .join("، ") || (isAr ? "لا شيء" : "none")}
                  </p>
                </div>
              )}
            </section>

            {(changedModules.length > 0 || plan.wording.length > 0) && (
              <section className="space-y-1.5">
                <h3 className="font-semibold text-foreground">
                  {isAr ? "ما يتغيّر في المتجر" : "What changes in the store"}
                </h3>
                <ul className="space-y-1 text-muted-foreground">
                  {changedModules.map((id) => (
                    <li key={id}>
                      {MODULE_LABELS[id][lang]}:{" "}
                      {plan.modules.after[id]
                        ? isAr
                          ? "يُفعَّل"
                          : "turns on"
                        : isAr
                          ? "يُوقف"
                          : "turns off"}
                    </li>
                  ))}
                  {plan.wording.slice(0, 4).map((change) => (
                    <li key={change.key} className="flex flex-wrap items-center gap-1">
                      «{change.before[lang]}»
                      <Arrow className="size-3" aria-hidden="true" />«{change.after[lang]}»
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-1.5">
              <Label htmlFor="vertical-change-reason" className="font-semibold text-foreground">
                {isAr ? "سبب التغيير (يُحفظ في السجل)" : "Reason (kept in the history)"}
              </Label>
              <Textarea
                id="vertical-change-reason"
                value={reason}
                maxLength={500}
                rows={2}
                onChange={(event) => setReason(event.target.value)}
                placeholder={
                  isAr
                    ? "مثال: طلب المالك، المتجر يبيع قهوة مختصة الآن"
                    : "e.g. Owner's request: the store now sells specialty coffee"
                }
                className="resize-none text-xs"
              />
            </section>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={change.isPending}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={() => change.mutate()}
            disabled={!plan || !reasonOk || change.isPending}
          >
            {change.isPending
              ? isAr
                ? "جارٍ التطبيق…"
                : "Applying…"
              : isAr
                ? "تأكيد وتطبيق"
                : "Confirm & apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
