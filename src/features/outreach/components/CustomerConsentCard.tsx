import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircleHeart } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { invalidateOutreach, outreachQueries, setCustomerConsent } from "@/lib/data/outreach";

/**
 * Whether the client agreed to hear from the store: new pieces in their size and come-back
 * reminders reach only those who did (`isMarketingEligible`). There was nowhere to record it, so
 * every store's clients counted as not asked and no suggestion could reach anyone. Turning it off
 * records that they asked to stop (`opted_out_at`): they then never come up for a message.
 */
export function CustomerConsentCard({
  brandId,
  customerId,
  lang,
}: {
  brandId: string;
  customerId: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const consentQ = useQuery(outreachQueries.consent(brandId, customerId));
  const [saving, setSaving] = useState(false);
  const customer = consentQ.data;
  if (!customer) return null;

  const agreed = customer.marketing_consent === true;
  const status = agreed
    ? isAr
      ? "وافق على استلام رسائل المتجر: القطع الجديدة بمقاسه وتذكير العودة."
      : "Agreed to hear from the store: new pieces in their size and come-back reminders."
    : customer.opted_out_at
      ? isAr
        ? `طلب إيقاف الرسائل في ${new Date(customer.opted_out_at).toLocaleDateString("ar-u-nu-latn")}.`
        : `Asked to stop messages on ${new Date(customer.opted_out_at).toLocaleDateString("en-GB")}.`
      : isAr
        ? "لم يُسأل بعد. سجّل موافقته عندما يوافق."
        : "Not asked yet. Record it when they agree.";

  const change = async (next: boolean) => {
    setSaving(true);
    try {
      await setCustomerConsent(brandId, { id: customer.id, name: customer.name }, next);
      toast.success(
        next
          ? isAr
            ? "سُجّلت موافقته."
            : "Their consent is recorded."
          : isAr
            ? "سُجّل أنه لا يرغب بالرسائل."
            : "Recorded that they don't want messages.",
      );
    } catch (error) {
      toast.error(isAr ? "تعذّر حفظ ذلك." : "That was not saved.", {
        description: getFriendlyErrorMessage(error),
      });
    } finally {
      await invalidateOutreach(qc, brandId);
      setSaving(false);
    }
  };

  return (
    <Card className="flex items-start gap-3 overflow-hidden rounded-2xl border border-border-subtle bg-card p-4 shadow-lg">
      <MessageCircleHeart className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor={`consent-${customerId}`} className="block text-sm font-semibold">
          {isAr ? "يرغب برسائل المتجر" : "Agreed to hear from us"}
        </label>
        <p className="text-xs leading-relaxed text-muted-foreground">{status}</p>
      </div>
      <Switch
        id={`consent-${customerId}`}
        checked={agreed}
        disabled={saving}
        onCheckedChange={(next) => void change(next)}
      />
    </Card>
  );
}
