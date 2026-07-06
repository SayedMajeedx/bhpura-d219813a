import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Check, MessageCircle, Search, Megaphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/campaigns")({
  component: CampaignsPage,
});

type Customer = {
  id: string;
  name: string;
  phone: string | null;
};

const DEFAULT_EN = "Hi {{customer_name}}, this is {{business_name}}. We have exciting news for you!";
const DEFAULT_AR = "مرحبًا {{customer_name}}، معكم {{business_name}}. لدينا عرض مميز لك!";

function CampaignsPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const [message, setMessage] = useState(isAr ? DEFAULT_AR : DEFAULT_EN);
  const [search, setSearch] = useState("");
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const customersQ = useQuery({
    queryKey: ["campaigns-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });

  const ordersQ = useQuery({
    queryKey: ["campaigns-order-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("customer_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((o: { customer_id: string | null }) => {
        if (o.customer_id) counts[o.customer_id] = (counts[o.customer_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const businessQ = useQuery({
    queryKey: ["campaigns-business"],
    queryFn: async () => {
      const { data } = await supabase.from("business_settings").select("business_name").maybeSingle();
      return data?.business_name ?? "";
    },
  });

  const businessName = businessQ.data ?? "";

  const filtered = useMemo(() => {
    const list = customersQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q),
    );
  }, [customersQ.data, search]);

  const buildMessage = (customerName: string) =>
    message
      .replaceAll("{{customer_name}}", customerName || "")
      .replaceAll("{{business_name}}", businessName || "");

  const send = (c: Customer) => {
    if (!c.phone || !c.phone.trim()) {
      toast.error(isAr ? "لا يوجد رقم هاتف" : "No phone number on file");
      return;
    }
    const phone = c.phone.replace(/[^\d]/g, "");
    if (!phone) {
      toast.error(isAr ? "رقم الهاتف غير صالح" : "Invalid phone number");
      return;
    }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(buildMessage(c.name))}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setSent((s) => ({ ...s, [c.id]: true }));
  };

  const resetSent = () => setSent({});

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-4xl font-display">
            {isAr ? "حملات الواتساب" : "WhatsApp Campaigns"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAr
              ? "أرسل رسائل تسويقية مخصصة إلى عملائك عبر الواتساب."
              : "Broadcast personalized marketing messages to your customers via WhatsApp."}
          </p>
        </div>
      </div>

      <Card className="p-4 sm:p-6 mb-6 space-y-3">
        <div>
          <Label className="text-sm font-medium">
            {isAr ? "نص الرسالة" : "Broadcast message"}
          </Label>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            {isAr ? "استخدم" : "Use"}{" "}
            <code className="px-1 py-0.5 rounded bg-secondary text-foreground">{"{{customer_name}}"}</code>{" "}
            {isAr ? "و" : "and"}{" "}
            <code className="px-1 py-0.5 rounded bg-secondary text-foreground">{"{{business_name}}"}</code>{" "}
            {isAr ? "للتخصيص التلقائي." : "for automatic personalization."}
          </p>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="text-start"
            dir={isAr ? "rtl" : "ltr"}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {isAr ? "معاينة للعميل الأول:" : "Preview for first customer:"}{" "}
          <span className="text-foreground">
            {buildMessage(filtered[0]?.name ?? (isAr ? "العميل" : "Customer"))}
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? "ابحث عن عميل..." : "Search customer..."}
              className="ps-9 text-start"
            />
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              {Object.values(sent).filter(Boolean).length}/{filtered.length}{" "}
              {isAr ? "مرسلة" : "sent"}
            </span>
            {Object.keys(sent).length > 0 && (
              <Button variant="ghost" size="sm" onClick={resetSent}>
                {isAr ? "إعادة تعيين" : "Reset"}
              </Button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            {isAr ? "لا يوجد عملاء." : "No customers found."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-secondary/50">
                <tr className="text-start">
                  <th className="p-4 font-medium text-start">
                    {isAr ? "الاسم" : "Name"}
                  </th>
                  <th className="p-4 font-medium text-start">
                    {isAr ? "الهاتف" : "Phone"}
                  </th>
                  <th className="p-4 font-medium text-start">
                    {isAr ? "إجمالي الطلبات" : "Total Orders"}
                  </th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const isSent = !!sent[c.id];
                  const orderCount = ordersQ.data?.[c.id] ?? 0;
                  return (
                    <tr
                      key={c.id}
                      className={`border-t border-border ${isSent ? "bg-primary/5" : ""}`}
                    >
                      <td className="p-4 font-medium">{c.name}</td>
                      <td className="p-4 text-muted-foreground" dir="ltr">
                        {c.phone || "—"}
                      </td>
                      <td className="p-4 text-muted-foreground">{orderCount}</td>
                      <td className="p-4 text-end">
                        {isSent ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                            <Check className="h-3 w-3" /> {isAr ? "تم الإرسال" : "Sent"}
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => send(c)}
                            disabled={!c.phone}
                          >
                            <MessageCircle className="h-4 w-4 me-2" />
                            {isAr ? "إرسال عبر الواتساب" : "Send via WhatsApp"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
