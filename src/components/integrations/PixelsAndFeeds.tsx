import { AnalyticsTrackingCard } from "@/components/integrations/AnalyticsTrackingCard";
import { ShoppingFeedCard } from "@/components/integrations/ShoppingFeedCard";

/** The integrations' "Pixels" tab: the shopping catalog for Meta and Google, then tracking. */
export function PixelsAndFeeds({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  return (
    <>
      <ShoppingFeedCard brandId={brandId} isAr={isAr} />
      <AnalyticsTrackingCard brandId={brandId} isAr={isAr} />
    </>
  );
}
