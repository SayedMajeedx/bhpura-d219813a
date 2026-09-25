import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Storefront } from "@/features/checkout/types";
import type { usePickupAndDigital } from "@/features/checkout/hooks/use-pickup-and-digital";

/** The branch to collect the order from. */
export function PickupBranchCard({
  branchId,
  branchLabel,
  branchLoc,
  branches,
  lang,
  setBranchId,
  t,
}: {
  branchId: ReturnType<typeof usePickupAndDigital>["branchId"];
  branchLabel: ReturnType<typeof usePickupAndDigital>["branchLabel"];
  branchLoc: ReturnType<typeof usePickupAndDigital>["branchLoc"];
  branches: ReturnType<typeof usePickupAndDigital>["branches"];
  lang: Storefront["lang"];
  setBranchId: ReturnType<typeof usePickupAndDigital>["setBranchId"];
  t: Storefront["t"];
}) {
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-display text-xl">{t("اختر الفرع", "Choose branch")}</h2>
      {branches.length === 0 ? (
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
                    <div className="font-semibold truncate">{branchLabel(b)}</div>
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
    </Card>
  );
}
