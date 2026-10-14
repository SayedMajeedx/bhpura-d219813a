import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Storefront } from "@/features/checkout/types";
import type { usePickupAndDigital } from "@/features/checkout/hooks/use-pickup-and-digital";
import {
  branchPickupNote,
  partnerPickupText,
  type PickupPartners,
} from "@/features/checkout/lib/pickup-places";

/**
 * Where to collect the order: one of the store's branches, or a partner's shop that holds every
 * piece of the cart. Under a branch, a note when some pieces are brought from a partner first.
 */
export function PickupBranchCard({
  branchId,
  branchLabel,
  branchLoc,
  branches,
  lang,
  setBranchId,
  t,
  pickupPartners = { partners: [], from_partner: false, transfer_days: null },
  partnerId = "",
  setPartnerId = () => undefined,
}: {
  branchId: ReturnType<typeof usePickupAndDigital>["branchId"];
  branchLabel: ReturnType<typeof usePickupAndDigital>["branchLabel"];
  branchLoc: ReturnType<typeof usePickupAndDigital>["branchLoc"];
  branches: ReturnType<typeof usePickupAndDigital>["branches"];
  lang: Storefront["lang"];
  setBranchId: ReturnType<typeof usePickupAndDigital>["setBranchId"];
  t: Storefront["t"];
  pickupPartners?: PickupPartners;
  partnerId?: string;
  setPartnerId?: (id: string) => void;
}) {
  const partners = pickupPartners.partners;
  const branchNote = branchPickupNote(pickupPartners, lang);
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display text-xl">
        {partners.length > 0
          ? t("مكان الاستلام", "Where to collect")
          : t("اختر الفرع", "Choose branch")}
      </h2>
      {branches.length === 0 && partners.length > 0 ? null : branches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("لا توجد فروع متاحة حاليًا.", "No branches available right now.")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {branches.map((b) => {
            const active = branchId === b.id;
            return (
              <Button
                key={b.id}
                type="button"
                variant={active ? "outline" : "ghost"}
                onClick={() => setBranchId(b.id)}
                className={`relative text-start flex flex-col items-start justify-center h-auto p-4 rounded-xl border-2 transition-all hover:shadow-sm ${
                  active ? "border-primary bg-primary/10" : "border-border"
                }`}
                aria-pressed={active}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 grid place-items-center transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40"
                    }`}
                    aria-hidden
                  >
                    {active && <span className="h-2 w-2 rounded-full bg-primary-foreground" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold line-clamp-2 break-words">{branchLabel(b)}</div>
                    {branchLoc(b) && (
                      <div className="text-xs text-muted-foreground mt-0.5">{branchLoc(b)}</div>
                    )}
                    {(lang === "ar" ? b.notes_ar : b.notes_en) && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {lang === "ar" ? b.notes_ar : b.notes_en}
                      </div>
                    )}
                  </div>
                </div>
              </Button>
            );
          })}
        </div>
      )}
      {branchNote && branches.length > 0 && !partnerId && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {branchNote}
        </p>
      )}

      {partners.length > 0 && (
        <div className="space-y-2 pt-1">
          {branches.length > 0 && (
            <p className="text-sm font-semibold">
              {t("أو استلم من محل شريك", "Or collect at a partner's shop")}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {partners.map((partner) => {
              const active = partnerId === partner.id;
              const { address, notes } = partnerPickupText(partner, lang);
              return (
                <div
                  key={partner.id}
                  className={`rounded-xl border-2 transition-all ${active ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setPartnerId(partner.id)}
                    aria-pressed={active}
                    className="h-auto w-full items-start justify-start whitespace-normal p-4 text-start hover:bg-transparent"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 grid place-items-center transition-colors ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40"
                        }`}
                        aria-hidden
                      >
                        {active && <span className="h-2 w-2 rounded-full bg-primary-foreground" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div
                          dir="auto"
                          className="text-page-start font-semibold line-clamp-2 break-words"
                        >
                          {partner.name}
                        </div>
                        {address && (
                          <div className="mt-0.5 break-words text-xs text-muted-foreground">
                            {address}
                          </div>
                        )}
                        {notes && (
                          <div className="mt-1 break-words text-xs text-muted-foreground">
                            {notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </Button>
                  {partner.location_url && (
                    <a
                      href={partner.location_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mx-4 mb-3 inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      {t("الموقع على الخريطة", "Open in maps")}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
