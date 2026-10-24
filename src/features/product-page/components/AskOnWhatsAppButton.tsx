import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStorefront } from "@/lib/storefront-context";
import { trackProductEngagement } from "@/lib/storefront-tracking";

/**
 * "Ask about this product" in a phone's bar at the foot of a product page: the store's WhatsApp
 * with a message naming the product. It stands in for the floating WhatsApp button there, which
 * sat over the page's own buttons (`WhatsAppFab` leaves product pages to it on a phone).
 */
export function AskOnWhatsAppButton({ url, productId }: { url: string; productId: string }) {
  const { brand, t } = useStorefront();
  return (
    <Button asChild variant="outline" size="icon" className="size-11 shrink-0 border-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("اسأل عن المنتج عبر واتساب", "Ask about this product on WhatsApp")}
        onClick={() => void trackProductEngagement(brand.slug, productId, "inquiry")}
      >
        <MessageCircle className="size-5" aria-hidden="true" />
      </a>
    </Button>
  );
}
