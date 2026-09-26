import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  FULFILLMENT_METHOD_FILTER_OPTIONS,
  OrdersToolbar,
} from "../src/components/orders/OrdersToolbar";

function renderToolbar(fulfillmentMethodFilter: string) {
  render(
    <OrdersToolbar
      lang="en"
      search=""
      onSearchChange={vi.fn()}
      paymentFilter="all"
      onPaymentFilterChange={vi.fn()}
      fulfillmentStatusFilter="all"
      onFulfillmentStatusFilterChange={vi.fn()}
      fulfillmentMethodFilter={fulfillmentMethodFilter}
      onFulfillmentMethodFilterChange={vi.fn()}
      gatewayFilter="all"
      onGatewayFilterChange={vi.fn()}
      includeHistorical={false}
      onIncludeHistoricalChange={vi.fn()}
      sortOrder="newest"
      onSortOrderChange={vi.fn()}
      activeFilterCount={fulfillmentMethodFilter === "all" ? 0 : 1}
      onClearFilters={vi.fn()}
    />,
  );
}

describe("orders fulfillment-method filter", () => {
  it("shows the delivery-method filter with the current choice", () => {
    renderToolbar("pickup");
    // The desktop popover trigger is the first of the two filter buttons.
    fireEvent.click(screen.getAllByRole("button", { name: "Open filter options" })[0]);

    expect(screen.getByText("Fulfillment Method")).toBeInTheDocument();
    expect(screen.getByText("Pickup")).toBeInTheDocument();
  });

  it("offers exactly the methods the orders table allows", () => {
    // orders_fulfillment_method_check: delivery | pickup | digital
    const values = FULFILLMENT_METHOD_FILTER_OPTIONS.map((option) => option.value);
    expect(values).toEqual(["all", "delivery", "pickup", "digital"]);
  });
});
