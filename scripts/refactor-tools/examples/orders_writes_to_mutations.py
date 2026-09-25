"""Orders data layer step 2: screens write orders through src/lib/data/orders mutations."""
import re


def read(p):
    return open(p, encoding="utf-8").read()


def write(p, s):
    open(p, "w", encoding="utf-8", newline="").write(s)


def patch(p, reps):
    s = read(p)
    for a, b, *n in reps:
        c = n[0] if n else 1
        assert s.count(a) == c, (p, a[:90], s.count(a))
        s = s.replace(a, b)
    write(p, s)


def add_import(p, line):
    s = read(p)
    if line in s:
        return
    i = s.index("\n\n")
    write(p, s[:i] + "\n" + line + s[i:])


INV = 'qc.invalidateQueries({ queryKey: ["orders", brandId] })'

# ---------------------------------------------------------------------------
# order-primary-action: 11 status updates
P = "src/features/orders/components/order-primary-action.tsx"
s = read(P)
pat = re.compile(
    r'const \{ error \} = await supabase\n(\s+)\.from\("orders"\)\n\s+\.update\(\{\n(.*?)\n\s+\} as any\)\n\s+\.eq\("id", order\.id\);\n(\s+)if \(error\) throw error;',
    re.S,
)
s, n = pat.subn(lambda m: "await updateOrder(brandId, order.id, {\n" + m.group(2) + "\n" + m.group(3) + "});", s)
assert n == 10, n
a = '''            const updatePayload: Record<string, any> = {'''
assert s.count(a) == 1
s = s.replace(a, "            const updatePayload: OrderPatch = {")
a = '''            const { error } = await supabase
              .from("orders")
              .update(updatePayload as any)
              .eq("id", order.id);
            if (error) throw error;'''
assert s.count(a) == 1
s = s.replace(a, "            await updateOrder(brandId, order.id, updatePayload);")
c = s.count(INV)
assert c == 11, c
s = s.replace(INV, "invalidateOrders(qc, brandId)")
s = s.replace('import { supabase } from "@/integrations/supabase/client";\n', "")
write(P, s)
add_import(P, 'import { invalidateOrders, updateOrder, type OrderPatch } from "@/lib/data/orders";')

# ---------------------------------------------------------------------------
P = "src/features/orders/actions/order-status-change.ts"
patch(
    P,
    [
        ("      const updatePayload: any = {", "      const updatePayload: OrderPatch = {"),
        (
            '      const { error } = await supabase.from("orders").update(updatePayload).eq("id", order.id);\n\n      if (error) throw error;\n',
            "      await updateOrder(brandId, order.id, updatePayload);\n",
        ),
        (INV, "invalidateOrders(qc, brandId)"),
        ('import { supabase } from "@/integrations/supabase/client";\n', ""),
    ],
)
add_import(P, 'import { invalidateOrders, updateOrder, type OrderPatch } from "@/lib/data/orders";')

# ---------------------------------------------------------------------------
P = "src/features/orders/hooks/use-complete-delivery.ts"
s = read(P)
m = re.search(
    r'      const \{ error: rpcErr \} = await \(supabase\.rpc as any\)\("courier_complete_delivery", \{\n        p_order_id: order\.id,\n        p_collected_amount: ([^\n]+),\n        p_notes: notes \|\| null,\n      \}\);\n',
    s,
)
assert m, "complete rpc"
s = s.replace(
    m.group(0),
    f"      const rpcErr = await courierCompleteDelivery(order.id, {m.group(1)}, notes || null);\n",
)
for a, b in [
    ("Number(order.advance_paid ?? order.paid_amount ?? 0)", "Number(order.advance_paid ?? 0)"),
    (
        '''        const { error: updateErr } = await supabase
          .from("orders")
          .update({''',
        """        await updateOrder(brandId, order.id, {""",
    ),
    (
        '''          } as any)
          .eq("id", order.id);

        if (updateErr) throw updateErr;''',
        """        });""",
    ),
    ("  const handleCompleteDelivery = async (order: any, amountToCollect: number, notes?: string) => {",
     "  const handleCompleteDelivery = async (\n    order: OrderListRow,\n    amountToCollect: number,\n    notes?: string,\n  ) => {"),
    ("    const previousOrders = qc.getQueryData<any[]>(ordersQueryKey);", "    const previousOrders = qc.getQueryData<OrderListRow[]>(ordersQueryKey);"),
    ("    qc.setQueryData<any[]>(ordersQueryKey, (current) =>", "    qc.setQueryData<OrderListRow[]>(ordersQueryKey, (current) =>"),
    ("      qc.invalidateQueries({ queryKey: ordersKeys.all(brandId) });", "      invalidateOrders(qc, brandId);"),
    ('import { supabase } from "@/integrations/supabase/client";\n', ""),
    (
        'import { ordersKeys } from "@/lib/data/orders";',
        'import {\n  courierCompleteDelivery,\n  invalidateOrders,\n  ordersKeys,\n  updateOrder,\n  type OrderListRow,\n} from "@/lib/data/orders";',
    ),
]:
    assert s.count(a) == 1, (P, a[:80], s.count(a))
    s = s.replace(a, b)
write(P, s)

# ---------------------------------------------------------------------------
P = "src/features/orders/hooks/use-order-payment-details.ts"
patch(
    P,
    [
        (
            '''      const { error } = await supabase.from("orders").update(paymentFields).eq("id", order.id);

      if (error) {
        setOrder({ ...order });
        throw error;
      }''',
            '''      try {
        await updateOrder(brandId, order.id, paymentFields);
      } catch (error) {
        setOrder({ ...order });
        throw error;
      }''',
        ),
        ("      qc.invalidateQueries({ queryKey: ordersKeys.all(brandId) });\n      qc.invalidateQueries({ queryKey: [\"orders\"] });\n",
         "      invalidateOrders(qc, brandId);\n"),
        ('import { supabase } from "@/integrations/supabase/client";\n', ""),
        ('import { ordersKeys } from "@/lib/data/orders";', 'import { invalidateOrders, updateOrder } from "@/lib/data/orders";'),
    ],
)

# ---------------------------------------------------------------------------
P = "src/features/orders/hooks/use-benefit-review.ts"
patch(
    P,
    [
        (
            '      const { error } = await supabase.rpc("approve_benefit_payment" as any, { p_order_id: id });\n      if (error) throw error;\n',
            "      await approveBenefitPayment(id);\n",
        ),
        (INV, "invalidateOrders(qc, brandId)", 2),
        ('import { supabase } from "@/integrations/supabase/client";\n', ""),
    ],
)
add_import(P, 'import { approveBenefitPayment, invalidateOrders } from "@/lib/data/orders";')

# ---------------------------------------------------------------------------
P = "src/features/orders/hooks/use-save-order.ts"
s = read(P)
old_create = s[s.index("    if (id === \"new\") {\n      const { data: created, error: createError }") : s.index("      localStorage.removeItem(`boutq_draft_${brandId}_new`);")]
new_create = '''    if (id === "new") {
      for (const it of items) {
        const isCustom = it.location === "custom" || !it.variant_id;
        if (isCustom && !it.location) {
          it.location = "custom";
        }
      }
      let createdId: string;
      try {
        createdId = await createOrderWithItems(
          brandId,
          { ...orderPayload, user_id: user.id, brand_id: brandId, invoice_number: 0 },
          (orderId) =>
            items.map((item) =>
              orderItemRow(item, { user_id: user.id, brand_id: brandId, order_id: orderId }),
            ),
        );
      } catch (createError) {
        setSaving(false);
        return toast.error(
          (createError as { message?: string } | null)?.message || "ORDER_CREATE_FAILED",
        );
      }
'''
s = s.replace(old_create, new_create)
for a, b in [
    ("params: { slug, id: created.id } });", "params: { slug, id: createdId } });"),
    (
        '''    const { error: oe } = await supabase
      .from("orders")
      .update(orderPayload as any)
      .eq("id", order.id);
    if (oe) {
      setSaving(false);
      return toast.error(oe.message);
    }''',
        '''    try {
      await updateOrder(brandId, order.id, orderPayload);
    } catch (oe) {
      setSaving(false);
      return toast.error((oe as { message?: string }).message);
    }''',
    ),
    (
        '''      const { error: repErr } = await (supabase.rpc as any)("replace_order_items", {
        p_order_id: order.id,
        p_items: itemsPayload,
      });

      if (repErr) {''',
        '''      const repErr = await replaceOrderItems(order.id, itemsPayload).then(
        () => null,
        (error: { message?: string }) => error,
      );

      if (repErr) {''',
    ),
    (INV, "invalidateOrders(qc, brandId)"),
]:
    assert s.count(a) == 1, (P, a[:80], s.count(a))
    s = s.replace(a, b)
write(P, s)
add_import(
    P,
    'import {\n  createOrderWithItems,\n  invalidateOrders,\n  replaceOrderItems,\n  updateOrder,\n} from "@/lib/data/orders";',
)

# ---------------------------------------------------------------------------
# remaining hand-built order keys in the orders screens
for P, n in [
    ("src/features/orders/components/order-queue-action.tsx", 1),
    ("src/features/orders/components/OrderFulfillmentModal.tsx", 2),
    ("src/routes/_authenticated/admin.b.$slug.orders.index.tsx", 7),
]:
    s = read(P)
    c = s.count(INV)
    assert c == n, (P, c)
    s = s.replace(INV, "invalidateOrders(qc, brandId)")
    s = s.replace(
        '      { table: "orders", brandId, queryKey: ["orders", brandId] },\n      { table: "order_items", brandId, queryKey: ["orders", brandId] },\n',
        '      { table: "orders", brandId, queryKey: ordersKeys.all(brandId) },\n      { table: "order_items", brandId, queryKey: ordersKeys.all(brandId) },\n',
    )
    write(P, s)
patch("src/features/orders/components/order-queue-action.tsx", [
    ('import { ordersKeys, type OrderListRow } from "@/lib/data/orders";', 'import { invalidateOrders, ordersKeys, type OrderListRow } from "@/lib/data/orders";'),
])
add_import("src/features/orders/components/OrderFulfillmentModal.tsx", 'import { invalidateOrders } from "@/lib/data/orders";')
patch("src/routes/_authenticated/admin.b.$slug.orders.index.tsx", [
    ('import { ordersQueries, type OrderListRow } from "@/lib/data/orders";',
     'import {\n  invalidateOrders,\n  ordersKeys,\n  ordersQueries,\n  type OrderListRow,\n} from "@/lib/data/orders";'),
])
print("ok")
