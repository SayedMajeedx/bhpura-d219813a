import * as React from "react";
import { StoreProfileCard } from "@/components/settings/StoreProfileCard";
import { useBrandSettingsFormContext } from "../../use-brand-settings-form";

export function VerticalGroup() {
  const { brandId, brand } = useBrandSettingsFormContext();

  return (
    <div className="space-y-4">
      <StoreProfileCard brandId={brandId} slug={brand.slug ?? ""} borderless={false} />
    </div>
  );
}
