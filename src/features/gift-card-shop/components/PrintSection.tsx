import { Printer, Smartphone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GiftAddon } from "@/lib/gift-addons";
import { GiftAddonsPicker } from "@/features/checkout/components/GiftAddonsPicker";
import type { BuyForm } from "../lib/gift-card-shop";
import { Choice } from "./BuyChoice";

/**
 * Digital, or printed by the store and delivered for its fee: the store's printing offer, with
 * where to deliver the card and a number there once printed is chosen, and the store's gift
 * add-ons (a bouquet, chocolates) to go with it, as a gift order offers them.
 */
export function PrintSection({
  form,
  setForm,
  fee,
  freePrint,
  problem,
  addons,
  currency,
  lang,
  t,
}: {
  form: BuyForm;
  setForm: (update: (current: BuyForm) => BuyForm) => void;
  fee: string;
  freePrint: boolean;
  problem: (key: "print_address" | "print_phone") => boolean;
  /** The store's gift add-ons a printed card may go with (none: nothing is drawn). */
  addons: readonly GiftAddon[];
  currency: string;
  lang: "ar" | "en";
  t: (ar: string, en: string) => string;
}) {
  const toggleAddon = (id: string) =>
    setForm((current) => {
      const next = { ...current.addons };
      if ((next[id] ?? 0) > 0) delete next[id];
      else next[id] = 1;
      return { ...current, addons: next };
    });
  const set = (key: "printAddress" | "printPhone") => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <p id="gift-print-label" className="text-sm font-semibold">
        {t("بطاقة رقمية أو مطبوعة", "Digital or printed")}
      </p>
      <div
        role="radiogroup"
        aria-labelledby="gift-print-label"
        className="grid gap-2 sm:grid-cols-2"
      >
        <Choice
          icon={Smartphone}
          label={t("رقمية", "Digital")}
          chosen={!form.print}
          onChoose={() => setForm((current) => ({ ...current, print: false }))}
        />
        <Choice
          icon={Printer}
          label={
            freePrint
              ? t("نطبعها ونوصلها", "We print and deliver it")
              : t(`نطبعها ونوصلها · + ${fee}`, `We print and deliver it · + ${fee}`)
          }
          chosen={form.print}
          onChoose={() => setForm((current) => ({ ...current, print: true }))}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {form.print
          ? t(
              "نطبع البطاقة ونوصلها إلى العنوان الذي تكتبه، ويصلك رمزها أيضًا.",
              "We print the card and deliver it to the address you write. You get its code too.",
            )
          : t(
              "يصلك رمز البطاقة وصورتها لترسلها بنفسك.",
              "You get the card's code and picture to send yourself.",
            )}
      </p>
      {form.print && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="gift-print-address">{t("عنوان التوصيل", "Delivery address")}</Label>
            <Textarea
              id="gift-print-address"
              value={form.printAddress}
              onChange={set("printAddress")}
              rows={2}
              maxLength={400}
              autoComplete="street-address"
              placeholder={t("المنطقة، المجمع، الطريق، المنزل", "Area, block, road, house")}
              aria-invalid={problem("print_address")}
            />
            {problem("print_address") && (
              <p className="text-xs text-destructive">
                {t("اكتب عنوان التوصيل.", "Write the delivery address.")}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gift-print-phone">
              {t("رقم المستلم للتوصيل", "Phone number at the address")}
            </Label>
            <Input
              id="gift-print-phone"
              value={form.printPhone}
              onChange={set("printPhone")}
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              maxLength={32}
              aria-invalid={problem("print_phone")}
            />
            {problem("print_phone") && (
              <p className="text-xs text-destructive">
                {t("اكتب رقم هاتف صحيحًا.", "Write a valid phone number.")}
              </p>
            )}
          </div>
          <GiftAddonsPicker
            gift={{ addons: [...addons], chosen: form.addons, toggleAddon }}
            currency={currency}
            lang={lang}
            t={t}
          />
        </div>
      )}
    </section>
  );
}
