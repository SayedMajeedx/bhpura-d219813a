import { Coins, CreditCard, FileText, Truck } from "lucide-react";
import { GroupNavigator, type GroupDef } from "@/features/settings/GroupNavigator";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useBrand } from "@/lib/brand-context";
import { PaymentsGroup } from "./PaymentsGroup";
import { PricingGroup } from "./PricingGroup";
import { FulfillmentGroup } from "./FulfillmentGroup";
import { ServiceFulfillmentGroup } from "./ServiceFulfillmentGroup";
import { InvoiceGroup } from "./InvoiceGroup";

/** A shop's shipping zones and estimates; a store without shipping (services) sets where its services happen. */
function FulfillmentForStore() {
  const brand = useBrand();
  const { profile } = useAdminStoreProfile(brand.id);
  return profile.modules.shipping ? <FulfillmentGroup /> : <ServiceFulfillmentGroup />;
}

const GROUPS: GroupDef[] = [
  { id: "payments", icon: CreditCard, render: () => <PaymentsGroup /> },
  { id: "pricing", icon: Coins, render: () => <PricingGroup /> },
  { id: "fulfillment", icon: Truck, render: () => <FulfillmentForStore /> },
  { id: "invoice", icon: FileText, render: () => <InvoiceGroup /> },
];

export function OrdersTab() {
  return <GroupNavigator tab="orders" groups={GROUPS} />;
}
