import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cron/cleanup-benefit-receipts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET?.trim();
        if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        const [{ supabaseAdmin }, { deletePrivateObject, isPrivateReceiptKey }] = await Promise.all(
          [import("@/integrations/supabase/client.server"), import("@/lib/private-r2.server")],
        );
        const now = new Date().toISOString();
        let deletedOrders = 0;
        let deletedAbandoned = 0;
        const errors: string[] = [];

        const { data: expiredOrders, error: orderError } = await (
          supabaseAdmin.from("orders") as any
        )
          .select("id, brand_id, benefit_receipt_key")
          .not("benefit_receipt_key", "is", null)
          .lte("benefit_receipt_delete_after", now)
          .limit(500);
        if (orderError) throw orderError;

        for (const order of expiredOrders ?? []) {
          try {
            if (!isPrivateReceiptKey(order.benefit_receipt_key, order.brand_id)) {
              throw new Error("invalid private receipt key");
            }
            await deletePrivateObject(order.benefit_receipt_key);
            const { error } = await (supabaseAdmin.from("orders") as any)
              .update({
                benefit_receipt_key: null,
                benefit_receipt_url: null,
                benefit_receipt_deleted_at: now,
              })
              .eq("id", order.id)
              .eq("benefit_receipt_key", order.benefit_receipt_key);
            if (error) throw error;
            deletedOrders += 1;
          } catch (error) {
            errors.push(`order:${order.id}:${String(error)}`);
          }
        }

        const { data: abandoned, error: pendingError } = await (supabaseAdmin as any)
          .from("pending_benefit_receipts")
          .select("id, brand_id, object_key")
          .is("consumed_at", null)
          .lt("expires_at", now)
          .limit(500);
        if (pendingError) throw pendingError;

        for (const pending of abandoned ?? []) {
          try {
            if (!isPrivateReceiptKey(pending.object_key, pending.brand_id)) {
              throw new Error("invalid private receipt key");
            }
            await deletePrivateObject(pending.object_key);
            const { error } = await (supabaseAdmin as any)
              .from("pending_benefit_receipts")
              .delete()
              .eq("id", pending.id)
              .is("consumed_at", null);
            if (error) throw error;
            deletedAbandoned += 1;
          } catch (error) {
            errors.push(`pending:${pending.id}:${String(error)}`);
          }
        }

        // Consumed upload slots no longer contain useful information once the
        // order owns the object key. Removing them does not remove the receipt.
        const consumedCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        await (supabaseAdmin as any)
          .from("pending_benefit_receipts")
          .delete()
          .not("consumed_at", "is", null)
          .lt("consumed_at", consumedCutoff);

        return Response.json(
          {
            ok: errors.length === 0,
            deletedOrders,
            deletedAbandoned,
            errorCount: errors.length,
          },
          { status: errors.length ? 207 : 200 },
        );
      },
    },
  },
});
