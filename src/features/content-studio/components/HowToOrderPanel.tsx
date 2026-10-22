import { Link } from "@tanstack/react-router";
import { ListOrdered } from "lucide-react";
import { MomentBox, SwitchRow } from "@/features/content-studio/components/MomentPanel";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/**
 * How to Order's steps as the story will say them, read from the store's
 * settings, with a way to the settings to change them. Nothing for other
 * templates.
 */
export function HowToOrderPanel({ studio }: { studio: ContentStudio }) {
  const { isAr, templateId, slug } = studio;
  if (templateId !== "how-to-order") return null;
  const { orderSteps, whatsappNumber, showWhatsapp, setShowWhatsapp } = studio;
  const steps = orderSteps ?? [];

  return (
    <MomentBox
      icon={ListOrdered}
      title={isAr ? "خطوات الطلب" : "The steps"}
      hint={
        isAr
          ? "من إعدادات متجرك: الدفع والتوصيل والاستلام. غيّرها هناك، والستوري يتبعها."
          : "From your store's settings: payment, delivery and pickup. Change them there and the story follows."
      }
    >
      {steps.length > 0 ? (
        <ol className="space-y-2">
          {steps.map((step, index) => (
            <li key={step.key} className="flex min-w-0 gap-2.5 text-xs">
              <span className="w-5 shrink-0 font-bold tabular-nums text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-foreground">{step.title}</span>
                {step.lines.map((pieces) => (
                  <span key={pieces.join(" ")} className="block break-words text-muted-foreground">
                    {pieces.join(" ")}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "لا توجد طرق دفع أو توصيل مفعّلة بعد."
            : "No payment or delivery method is switched on yet."}
        </p>
      )}
      {whatsappNumber && (
        <SwitchRow
          id="studio-order-whatsapp"
          label={isAr ? "إظهار رقم الواتساب" : "Show the WhatsApp number"}
          checked={showWhatsapp}
          onChange={setShowWhatsapp}
        />
      )}
      <Link
        to="/admin/b/$slug/settings"
        params={{ slug }}
        className="inline-flex text-xs font-semibold text-primary underline-offset-4 hover:underline"
      >
        {isAr ? "إعدادات الدفع والتوصيل" : "Payment and delivery settings"}
      </Link>
    </MomentBox>
  );
}
