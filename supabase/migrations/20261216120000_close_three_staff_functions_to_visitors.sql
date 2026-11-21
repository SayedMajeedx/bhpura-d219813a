-- Three staff steps were callable by visitors through the PUBLIC grant (in Tokyo too; the restore
-- added an explicit anon grant, which 20261216100000 took away, leaving PUBLIC). Each already refuses
-- a caller who is not the store's staff (can_access_brand and a permission), so a visitor got nothing
-- from them; this closes them as supabase/function-grants.json says. Signed-in staff keep their grant.
REVOKE EXECUTE ON FUNCTION public.rpc_create_exchange_replacement_order(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_manual_adjust_loyalty_points(uuid, uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_process_return_refund(uuid, uuid, text, numeric, text, text) FROM PUBLIC, anon;
