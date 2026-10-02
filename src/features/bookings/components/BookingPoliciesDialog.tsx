import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  bookingPoliciesQueries,
  invalidateBookingPolicies,
  saveBookingPolicy,
} from "@/lib/data/booking-policies";
import {
  NO_POLICY,
  policyColumns,
  policyFormError,
  policyFormFrom,
  policyLines,
  type PolicyForm,
} from "@/lib/bookings/policies";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

function PolicyFormFields({
  initial,
  isAr,
  depositPercent,
  saving,
  onSave,
}: {
  initial: PolicyForm;
  isAr: boolean;
  depositPercent: number;
  saving: boolean;
  onSave: (form: PolicyForm) => void;
}) {
  const [form, setForm] = useState(initial);
  const patch = (next: Partial<PolicyForm>) => setForm((current) => ({ ...current, ...next }));
  const problem = policyFormError(form, isAr);
  const preview = problem
    ? []
    : policyLines(policyColumns(form), { isAr, depositPercent, eventDay: null });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem) onSave(form);
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="policy-balance">
            {isAr ? "الرصيد المتبقي قبل المناسبة بـ (أيام)" : "Balance due before the event (days)"}
          </Label>
          <Input
            id="policy-balance"
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            dir="ltr"
            className="w-28"
            value={form.balance_due_days}
            onChange={(event) => patch({ balance_due_days: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="policy-move">
            {isAr ? "يمكن نقل الحجز خلال (أشهر)" : "A booking can be moved within (months)"}
          </Label>
          <Input
            id="policy-move"
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            dir="ltr"
            className="w-28"
            value={form.reschedule_months}
            onChange={(event) => patch({ reschedule_months: event.target.value })}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {isAr ? "اتركهما فارغين إن لم تكن لديك قاعدة." : "Leave them empty if you have no rule."}
      </p>

      <Label className="flex items-start gap-2 text-sm font-normal">
        <Checkbox
          className="mt-0.5"
          checked={form.deposit_refundable}
          onCheckedChange={(checked) => patch({ deposit_refundable: checked === true })}
        />
        <span>
          {isAr ? "العربون قابل للاسترداد عند الإلغاء" : "The deposit is refunded on cancellation"}
          <span className="block text-xs text-muted-foreground">
            {depositPercent > 0
              ? isAr
                ? `عربونك الحالي ${depositPercent}%.`
                : `Your deposit is ${depositPercent}%.`
              : isAr
                ? "لا يظهر هذا السطر إلا إذا كان للمتجر عربون (من قواعد الحجز)."
                : "This line shows only when the store takes a deposit (in the booking rules)."}
          </span>
        </span>
      </Label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="policy-terms-en">
            {isAr ? "شروط أخرى بالإنجليزية" : "Other terms (English)"}
          </Label>
          <Textarea
            id="policy-terms-en"
            rows={4}
            value={form.terms_en}
            onChange={(event) => patch({ terms_en: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="policy-terms-ar">
            {isAr ? "شروط أخرى بالعربية" : "Other terms (Arabic)"}
          </Label>
          <Textarea
            id="policy-terms-ar"
            dir="rtl"
            rows={4}
            value={form.terms_ar}
            onChange={(event) => patch({ terms_ar: event.target.value })}
          />
        </div>
      </div>

      {preview.length > 0 && (
        <div className="space-y-1 rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
          <p className="font-semibold">{isAr ? "كما يراها العميل" : "As the customer reads it"}</p>
          <ul className="list-disc ps-4">
            {preview.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {problem && (
        <p className="text-xs font-semibold text-destructive" role="alert">
          {problem}
        </p>
      )}
      <Button type="submit" disabled={saving || Boolean(problem)}>
        {isAr ? "حفظ الشروط" : "Save terms"}
      </Button>
    </form>
  );
}

/** The terms a store shows with a booking: balance, moving a booking, the deposit, free text. */
export function BookingPoliciesDialog({
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
  const query = useQuery(bookingPoliciesQueries.policy(brand.id));
  const save = useMutation({
    mutationFn: (form: PolicyForm) => saveBookingPolicy(brand.id, policyColumns(form)),
    onSuccess: async () => {
      await invalidateBookingPolicies(qc, brand.id);
      toast.success(isAr ? "تم حفظ الشروط" : "Terms saved");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="size-4 text-primary" aria-hidden="true" />
            {isAr ? "شروط الحجز" : "Booking terms"}
          </DialogTitle>
          <DialogDescription>
            {isAr
              ? "تظهر للعميل في صفحة الحجز وبعد إرسال الطلب، ويمكنك إرسال تذكير بالرصيد من بطاقة الحجز."
              : "Shown to the customer on the booking page and after they send a request. You can send a balance reminder from a booking's card."}
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {isAr ? "جارٍ التحميل…" : "Loading…"}
          </p>
        ) : (
          <PolicyFormFields
            initial={policyFormFrom(query.data ?? NO_POLICY)}
            isAr={isAr}
            depositPercent={page.rules.deposit_percent}
            saving={save.isPending}
            onSave={(form) => save.mutate(form)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
