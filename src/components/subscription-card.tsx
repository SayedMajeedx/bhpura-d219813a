import type { Brand } from "@/lib/brand-context";
import { BrandSubscriptionHub } from "@/components/subscription/BrandSubscriptionHub";

interface SubscriptionCardProps {
  brand: Brand;
}

export function SubscriptionCard({ brand }: SubscriptionCardProps) {
  return (
    <div className="w-full">
      <BrandSubscriptionHub brandId={brand.id} brandSlug={brand.slug} />
    </div>
  );
}

