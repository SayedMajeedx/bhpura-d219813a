import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function processAbandonedCarts(): Promise<{
  abandoned: number;
  expired: number;
}> {
  const { data, error } = await (supabaseAdmin.rpc as any)("rpc_process_abandoned_carts");
  if (error) throw error;
  return {
    abandoned: Number(data?.abandoned ?? 0),
    expired: Number(data?.expired ?? 0),
  };
}

