import { Coins, CreditCard, FileText, Truck } from "lucide-react";
import { GroupNavigator, type GroupDef } from "@/features/settings/GroupNavigator";
import { PaymentsGroup } from "./PaymentsGroup";
import { PricingGroup } from "./PricingGroup";
import { FulfillmentGroup } from "./FulfillmentGroup";
import { InvoiceGroup } from "./InvoiceGroup";

const GROUPS: GroupDef[] = [
  { id: "payments", icon: CreditCard, render: () => <PaymentsGroup /> },
  { id: "pricing", icon: Coins, render: () => <PricingGroup /> },
  { id: "fulfillment", icon: Truck, render: () => <FulfillmentGroup /> },
  { id: "invoice", icon: FileText, render: () => <InvoiceGroup /> },
];

export function OrdersTab() {
  return <GroupNavigator tab="orders" groups={GROUPS} />;
}
