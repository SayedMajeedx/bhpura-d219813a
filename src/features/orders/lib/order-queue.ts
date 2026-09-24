import { getFulfillmentStage, getOrderWorkflow } from "@/lib/order-workflow";

export function normalizedFulfillmentStage(order: any): string {
  return getFulfillmentStage(order);
}

export function orderNeedsOperatorAction(order: any, hasMadeToOrder?: boolean): boolean {
  return getOrderWorkflow(order, { productionStages: hasMadeToOrder }).needsAttention;
}
