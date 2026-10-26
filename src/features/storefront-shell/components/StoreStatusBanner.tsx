import { Clock } from "lucide-react";
import { intakeSentence } from "@/lib/opening-hours";
import { useStorefront } from "@/lib/storefront-context";
import { isCatalogMode } from "@/lib/storefront-mode";
import { useOrderIntake } from "@/features/storefront-shell/hooks/use-order-intake";

/**
 * A line under the store's header while it does not simply take orders: busy ("back at 18:30"),
 * or closed by its hours (when an order is handled, or when it takes orders again). The store
 * stays open to browse (the owner's decision of 2026-10-27); checkout says the same and the
 * database refuses what the store does not take.
 */
export function StoreStatusBanner() {
  const { settings, lang } = useStorefront();
  const status = useOrderIntake();
  if (!status || isCatalogMode(settings)) return null;
  const sentence = intakeSentence(status.intake, settings.opening_hours, status.now, lang);
  if (!sentence) return null;
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 bg-muted px-4 py-2 text-center text-sm text-foreground"
    >
      <Clock className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0">{sentence}</span>
    </p>
  );
}
