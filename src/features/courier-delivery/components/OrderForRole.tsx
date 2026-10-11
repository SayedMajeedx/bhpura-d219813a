import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/lib/profile-context";
import { CourierDeliveryPage } from "./CourierDeliveryPage";

/**
 * The order page for whoever opens it: a courier gets the delivery page, the office gets the
 * order editor. Until the profile is known neither is mounted, so a courier's browser never
 * starts the editor's queries (which a courier may not read).
 */
export function OrderForRole({ orderId, office }: { orderId: string; office: ReactNode }) {
  const { isCourier, isLoading } = useProfile();
  if (isLoading) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-3 sm:p-6" aria-busy="true">
        <Skeleton className="h-10 w-40 rounded-xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-36 w-full rounded-2xl" />
      </div>
    );
  }
  return isCourier ? <CourierDeliveryPage orderId={orderId} /> : <>{office}</>;
}
