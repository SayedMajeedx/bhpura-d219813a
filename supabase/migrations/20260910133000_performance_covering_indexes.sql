-- Orders & Order Items
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant_id ON public.order_items (variant_id);
CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON public.orders (branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_promo_code_id ON public.orders (promo_code_id);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_address_id ON public.orders (shipping_address_id);

-- Abandoned Carts
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_customer_id ON public.abandoned_carts (customer_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_recovered_order_id ON public.abandoned_carts (recovered_order_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_dispatch_logs_cart_id ON public.abandoned_cart_dispatch_logs (cart_id);

-- Loyalty & Store Credits
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_customer_id ON public.loyalty_accounts (customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_account_id ON public.loyalty_ledger (account_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_customer_id ON public.loyalty_ledger (customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_order_id ON public.loyalty_ledger (order_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_review_id ON public.loyalty_ledger (review_id);
CREATE INDEX IF NOT EXISTS idx_store_credits_customer_id ON public.store_credits (customer_id);
CREATE INDEX IF NOT EXISTS idx_store_credits_order_id ON public.store_credits (order_id);
CREATE INDEX IF NOT EXISTS idx_store_credits_return_id ON public.store_credits (return_id);

-- Returns & Exchanges
CREATE INDEX IF NOT EXISTS idx_return_items_brand_id ON public.return_items (brand_id);
CREATE INDEX IF NOT EXISTS idx_return_items_product_id ON public.return_items (product_id);
CREATE INDEX IF NOT EXISTS idx_return_items_replacement_product_id ON public.return_items (replacement_product_id);
CREATE INDEX IF NOT EXISTS idx_return_items_replacement_variant_id ON public.return_items (replacement_variant_id);
CREATE INDEX IF NOT EXISTS idx_return_items_restocked_to_branch_id ON public.return_items (restocked_to_branch_id);
CREATE INDEX IF NOT EXISTS idx_return_notification_events_brand_id ON public.return_notification_events (brand_id);
CREATE INDEX IF NOT EXISTS idx_return_notification_events_return_id ON public.return_notification_events (return_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_replacement_order_id ON public.return_requests (replacement_order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_requested_by_user_id ON public.return_requests (requested_by_user_id);

-- Inventory & Products
CREATE INDEX IF NOT EXISTS idx_inventory_movement_logs_variant_id ON public.inventory_movement_logs (variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_logs_branch_id ON public.inventory_movement_logs (branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_logs_return_id ON public.inventory_movement_logs (return_id);
CREATE INDEX IF NOT EXISTS idx_product_barcodes_product_id ON public.product_barcodes (product_id);
CREATE INDEX IF NOT EXISTS idx_product_barcodes_variant_id ON public.product_barcodes (variant_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories (parent_id);

-- Financial & Vendors
CREATE INDEX IF NOT EXISTS idx_cash_flow_accounts_brand_id ON public.cash_flow_accounts (brand_id);
CREATE INDEX IF NOT EXISTS idx_account_transactions_brand_id ON public.account_transactions (brand_id);
CREATE INDEX IF NOT EXISTS idx_account_transactions_source_account_id ON public.account_transactions (source_account_id);
CREATE INDEX IF NOT EXISTS idx_account_transactions_target_account_id ON public.account_transactions (target_account_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_brand_id ON public.journal_entries (brand_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry_id ON public.journal_entry_lines (entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_id ON public.journal_entry_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_brand_id ON public.ledger_accounts (brand_id);
CREATE INDEX IF NOT EXISTS idx_expenses_vendor_id ON public.expenses (vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendors_brand_id ON public.vendors (brand_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_brand_id ON public.purchase_orders (brand_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_id ON public.purchase_orders (vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON public.purchase_order_items (po_id);

-- Customer & Push Notifications
CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON public.customer_addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_customer_push_devices_user_id ON public.customer_push_devices (user_id);
CREATE INDEX IF NOT EXISTS idx_customer_push_events_customer_id ON public.customer_push_events (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_push_events_order_id ON public.customer_push_events (order_id);
CREATE INDEX IF NOT EXISTS idx_customer_fit_passports_customer_id ON public.customer_fit_passports (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_fit_passport_history_customer_id ON public.customer_fit_passport_history (customer_id);
CREATE INDEX IF NOT EXISTS idx_shared_carts_brand_id ON public.shared_carts (brand_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_brand_id ON public.whatsapp_outbox (brand_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_brand_id ON public.whatsapp_webhook_events (brand_id);
CREATE INDEX IF NOT EXISTS idx_pending_benefit_receipts_brand_id ON public.pending_benefit_receipts (brand_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_claims_order_id ON public.idempotency_claims (order_id);
