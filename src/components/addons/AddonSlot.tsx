import React, { Suspense } from "react";
import type { SlotPlacement } from "@/lib/addons/addon-types";
import { contributionsFor } from "@/lib/addons/addon-registry";
import { useAddons } from "./AddonsProvider";
import { AddonErrorBoundary } from "./AddonErrorBoundary";

export interface AddonSlotProps<P = Record<string, unknown>> {
  placement: SlotPlacement;
  props?: P;
  fallback?: React.ReactNode;
  className?: string;
}

export function AddonSlot<P extends Record<string, unknown> = Record<string, unknown>>({
  placement,
  props,
  fallback = null,
  className,
}: AddonSlotProps<P>) {
  const { addons } = useAddons();
  const slots = contributionsFor(addons, placement);

  if (slots.length === 0) return null;

  const content = (
    <>
      {slots.map((slot) => {
        const SlotComponent = slot.component;
        return (
          <AddonErrorBoundary
            key={slot.id}
            addonId={slot.addonId}
            slotId={slot.id}
            fallback={fallback}
          >
            <Suspense fallback={fallback}>
              <SlotComponent {...(props as any)} />
            </Suspense>
          </AddonErrorBoundary>
        );
      })}
    </>
  );

  if (className) {
    return <div className={className}>{content}</div>;
  }

  return content;
}
