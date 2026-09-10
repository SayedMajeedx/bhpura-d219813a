-- 1. Profiles InitPlan optimization
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT TO public
  USING (id = (SELECT auth.uid()) OR is_admin());

DROP POLICY IF EXISTS "Users can update own name" ON public.profiles;
CREATE POLICY "Users can update own name" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()) AND email = (SELECT email FROM public.profiles WHERE id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (
    id = (SELECT auth.uid())
    AND NOT (email IS DISTINCT FROM (SELECT p.email FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
    AND (role = (SELECT p.role FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
    AND (status = (SELECT p.status FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
    AND NOT (brand_id IS DISTINCT FROM (SELECT p.brand_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
    AND NOT (permissions IS DISTINCT FROM (SELECT p.permissions FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  );

-- 2. Activity Logs
DROP POLICY IF EXISTS "Tenant Activity Logs Access" ON public.activity_logs;
CREATE POLICY "Tenant Activity Logs Access" ON public.activity_logs
  FOR ALL TO public
  USING ((SELECT auth.uid()) IS NOT NULL AND (brand_id IS NULL OR can_access_brand(brand_id)));

-- 3. System Audit Logs
DROP POLICY IF EXISTS "Allow superadmin select system_audit_logs" ON public.system_audit_logs;
CREATE POLICY "Allow superadmin select system_audit_logs" ON public.system_audit_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'super_admin'));

DROP POLICY IF EXISTS "Allow superadmin insert system_audit_logs" ON public.system_audit_logs;
CREATE POLICY "Allow superadmin insert system_audit_logs" ON public.system_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'super_admin'));

-- 4. Orders Courier Policy
DROP POLICY IF EXISTS "courier assigned orders read" ON public.orders;
CREATE POLICY "courier assigned orders read" ON public.orders
  FOR SELECT TO authenticated
  USING (
    assigned_to = (SELECT auth.uid())
    AND fulfillment_method = 'delivery'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'courier'
        AND p.status = 'active'
        AND p.brand_id = orders.brand_id
    )
  );

-- 5. White Label Apps
DROP POLICY IF EXISTS "super admins read white label apps" ON public.white_label_apps;
CREATE POLICY "super admins read white label apps" ON public.white_label_apps
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.status = 'active' AND p.role = 'super_admin'
  ));

DROP POLICY IF EXISTS "super admins read white label builds" ON public.white_label_app_builds;
CREATE POLICY "super admins read white label builds" ON public.white_label_app_builds
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.status = 'active' AND p.role = 'super_admin'
  ));

-- 6. Returns & Exchanges
DROP POLICY IF EXISTS "return_requests_customer_select" ON public.return_requests;
CREATE POLICY "return_requests_customer_select" ON public.return_requests
  FOR SELECT TO authenticated
  USING (customer_id IN (
    SELECT customers.id FROM public.customers WHERE customers.auth_user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "return_requests_customer_insert" ON public.return_requests;
CREATE POLICY "return_requests_customer_insert" ON public.return_requests
  FOR INSERT TO authenticated
  WITH CHECK (customer_id IN (
    SELECT customers.id FROM public.customers WHERE customers.auth_user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "return_items_customer_select" ON public.return_items;
CREATE POLICY "return_items_customer_select" ON public.return_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.return_requests rr
    JOIN public.customers c ON c.id = rr.customer_id
    WHERE rr.id = return_items.return_id AND c.auth_user_id = (SELECT auth.uid())
  ));

-- 7. Store Credits
DROP POLICY IF EXISTS "store_credits_customer_select" ON public.store_credits;
CREATE POLICY "store_credits_customer_select" ON public.store_credits
  FOR SELECT TO authenticated
  USING (customer_id IN (
    SELECT customers.id FROM public.customers WHERE customers.auth_user_id = (SELECT auth.uid())
  ));

-- 8. Loyalty
DROP POLICY IF EXISTS "customers_read_own_loyalty_account" ON public.loyalty_accounts;
CREATE POLICY "customers_read_own_loyalty_account" ON public.loyalty_accounts
  FOR SELECT TO authenticated
  USING (customer_id IN (
    SELECT c.id FROM public.customers c WHERE c.auth_user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "customers_read_own_loyalty_ledger" ON public.loyalty_ledger;
CREATE POLICY "customers_read_own_loyalty_ledger" ON public.loyalty_ledger
  FOR SELECT TO authenticated
  USING (customer_id IN (
    SELECT c.id FROM public.customers c WHERE c.auth_user_id = (SELECT auth.uid())
  ));

-- 9. Customer Fit Passports
DROP POLICY IF EXISTS "customers_read_own_fit_passport" ON public.customer_fit_passports;
CREATE POLICY "customers_read_own_fit_passport" ON public.customer_fit_passports
  FOR SELECT TO authenticated
  USING (customer_id IN (
    SELECT customers.id FROM public.customers WHERE customers.auth_user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "customers_insert_own_fit_passport" ON public.customer_fit_passports;
CREATE POLICY "customers_insert_own_fit_passport" ON public.customer_fit_passports
  FOR INSERT TO authenticated
  WITH CHECK (customer_id IN (
    SELECT customers.id FROM public.customers
    WHERE customers.auth_user_id = (SELECT auth.uid()) AND customers.brand_id = customer_fit_passports.brand_id
  ));

DROP POLICY IF EXISTS "customers_update_own_fit_passport" ON public.customer_fit_passports;
CREATE POLICY "customers_update_own_fit_passport" ON public.customer_fit_passports
  FOR UPDATE TO authenticated
  USING (customer_id IN (
    SELECT customers.id FROM public.customers
    WHERE customers.auth_user_id = (SELECT auth.uid()) AND customers.brand_id = customer_fit_passports.brand_id
  ))
  WITH CHECK (customer_id IN (
    SELECT customers.id FROM public.customers
    WHERE customers.auth_user_id = (SELECT auth.uid()) AND customers.brand_id = customer_fit_passports.brand_id
  ));
