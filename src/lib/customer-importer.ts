import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CustomerImportSchema = z.object({
  brandId: z.string().uuid(),
  customers: z.array(z.object({
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    notes: z.string().nullable(),
    totalOrders: z.number().default(0),
    totalSpend: z.number().default(0),
    tags: z.array(z.string()).default([]),
  })),
});

export const importCustomerDatabase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => CustomerImportSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const [{ data: canAccess }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("can_access_brand", { _brand_id: data.brandId }),
      context.supabase.rpc("is_admin"),
    ]);
    if (!canAccess || !isAdmin) throw new Error("FORBIDDEN");

    const session = context.session;
    const userId = session?.user?.id;
    if (!userId) throw new Error("UNAUTHORIZED");

    let successCount = 0;
    const totalCount = data.customers.length;

    // Fetch existing phone numbers to prevent duplicates
    const { data: existingCustomers, error: fetchErr } = await context.supabase
      .from("customers")
      .select("phone")
      .eq("brand_id", data.brandId);

    if (fetchErr) {
      console.error("Failed to query existing customer contacts:", fetchErr);
    }

    const existingPhones = new Set((existingCustomers ?? []).map((c: any) => c.phone).filter(Boolean));
    const processedPhones = new Set<string>();

    for (const cust of data.customers) {
      try {
        if (cust.phone) {
          if (existingPhones.has(cust.phone) || processedPhones.has(cust.phone)) {
            continue; // Deduplicate contacts by phone number
          }
          processedPhones.add(cust.phone);
        }

        // Apply automatic source and VIP tagging
        const compositeTags = [...cust.tags];
        if (cust.totalSpend >= 100) {
          compositeTags.push("VIP Customer");
        }

        const compositeNotes = [
          compositeTags.length > 0 ? `Tags: ${compositeTags.join(", ")}` : null,
          cust.totalSpend > 0 ? `Spend: ${cust.totalSpend} BHD` : null,
          cust.totalOrders > 0 ? `Orders: ${cust.totalOrders}` : null,
          cust.notes ? `Notes: ${cust.notes}` : null,
        ].filter(Boolean).join(" | ");

        const { error: insertErr } = await context.supabase
          .from("customers")
          .insert({
            user_id: userId,
            brand_id: data.brandId,
            name: cust.name,
            phone: cust.phone,
            email: cust.email,
            notes: compositeNotes || null,
          });

        if (insertErr) {
          console.error("Failed to insert customer contact:", cust.name, insertErr);
          continue;
        }

        successCount++;
      } catch (err) {
        console.error("Customer import row level exception:", cust.name, err);
      }
    }

    return { successCount, totalCount };
  });
