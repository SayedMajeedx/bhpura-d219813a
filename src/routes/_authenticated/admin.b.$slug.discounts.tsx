import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2, Tags } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/discounts")({ component: DiscountCodes });

type Promo = {
  id: string; brand_id: string; code: string; discount_type: "percentage" | "fixed";
  discount_value: number; minimum_order_amount: number | null; is_active: boolean; created_at: string;
};
type PromoForm = Omit<Promo, "id" | "brand_id" | "created_at">;
const EMPTY: PromoForm = { code: "", discount_type: "percentage", discount_value: 0, minimum_order_amount: null, is_active: true };

function DiscountCodes() {
  const brand = useBrand();
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [form, setForm] = useState<PromoForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const promos = useQuery({
    queryKey: ["promo-codes", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("promo_codes" as any) as any)
        .select("id,brand_id,code,discount_type,discount_value,minimum_order_amount,is_active,created_at")
        .eq("brand_id", brand.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Promo[];
    },
  });

  const beginCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const beginEdit = (p: Promo) => { setEditing(p); setForm({ code: p.code, discount_type: p.discount_type, discount_value: p.discount_value, minimum_order_amount: p.minimum_order_amount, is_active: p.is_active }); setOpen(true); };
  const save = async () => {
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,32}$/.test(code)) return toast.error(ar ? "استخدم حروفاً وأرقاماً فقط (2–32)" : "Use 2–32 letters, numbers, hyphens, or underscores");
    if (!(form.discount_value > 0) || (form.discount_type === "percentage" && form.discount_value > 100)) return toast.error(ar ? "قيمة الخصم غير صحيحة" : "Enter a valid discount value");
    setSaving(true);
    const payload = { ...form, code, brand_id: brand.id, discount_value: Number(form.discount_value.toFixed(3)), minimum_order_amount: form.minimum_order_amount == null ? null : Number(form.minimum_order_amount.toFixed(3)), updated_at: new Date().toISOString() };
    const query = editing
      ? (supabase.from("promo_codes" as any) as any).update(payload).eq("id", editing.id).eq("brand_id", brand.id)
      : (supabase.from("promo_codes" as any) as any).insert(payload);
    const { error } = await query;
    setSaving(false);
    if (error) return toast.error(error.code === "23505" ? (ar ? "هذا الرمز موجود بالفعل" : "This code already exists") : error.message);
    toast.success(ar ? "تم حفظ رمز الخصم" : "Promo code saved");
    setOpen(false); qc.invalidateQueries({ queryKey: ["promo-codes", brand.id] });
  };
  const remove = async (p: Promo) => {
    if (!confirm(ar ? `حذف الرمز ${p.code}؟` : `Delete ${p.code}?`)) return;
    const { error } = await (supabase.from("promo_codes" as any) as any).delete().eq("id", p.id).eq("brand_id", brand.id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["promo-codes", brand.id] });
  };

  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8" dir={ar ? "rtl" : "ltr"}>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="font-display text-4xl">{ar ? "رموز الخصم" : "Discount Codes"}</h1><p className="mt-1 text-muted-foreground">{ar ? "أنشئ عروضاً خاصة بهذه العلامة التجارية." : "Create and manage promotions for this brand."}</p></div>
      <Button onClick={beginCreate}><Plus className="me-2 h-4 w-4" />{ar ? "إنشاء رمز" : "Create Promo Code"}</Button>
    </div>
    <Card className="overflow-hidden">
      {promos.isLoading ? <div className="p-8 text-center text-muted-foreground">{ar ? "جارٍ التحميل…" : "Loading…"}</div> : !promos.data?.length ?
        <div className="grid place-items-center gap-3 p-12 text-center"><Tags className="h-10 w-10 text-muted-foreground"/><div><div className="font-medium">{ar ? "لا توجد رموز خصم" : "No promo codes yet"}</div><div className="text-sm text-muted-foreground">{ar ? "أنشئ أول عرض للمتجر." : "Create your first storefront offer."}</div></div><Button variant="outline" onClick={beginCreate}>{ar ? "+ إضافة رمز" : "+ Add code"}</Button></div> :
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b bg-muted/50"><tr>{[ar?"الرمز":"Code",ar?"النوع":"Type",ar?"القيمة":"Value",ar?"الحد الأدنى":"Minimum",ar?"الحالة":"Status",ar?"الإجراءات":"Actions"].map(x=><th key={x} className="px-4 py-3 text-start font-medium">{x}</th>)}</tr></thead><tbody>{promos.data.map(p=><tr key={p.id} className="border-b last:border-0"><td className="px-4 py-4 font-mono font-semibold">{p.code}</td><td className="px-4 py-4">{p.discount_type === "percentage" ? (ar?"نسبة مئوية":"Percentage") : (ar?"مبلغ ثابت":"Fixed BHD")}</td><td className="px-4 py-4 tabular-nums">{p.discount_type === "percentage" ? `${p.discount_value}%` : `BHD ${Number(p.discount_value).toFixed(3)}`}</td><td className="px-4 py-4 tabular-nums">{p.minimum_order_amount == null ? "—" : `BHD ${Number(p.minimum_order_amount).toFixed(3)}`}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${p.is_active?"bg-emerald-100 text-emerald-800":"bg-muted text-muted-foreground"}`}>{p.is_active?(ar?"نشط":"Active"):(ar?"متوقف":"Inactive")}</span></td><td className="px-4 py-4"><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={()=>beginEdit(p)} aria-label="Edit"><Pencil className="h-4 w-4"/></Button><Button size="icon" variant="ghost" className="text-destructive" onClick={()=>remove(p)} aria-label="Delete"><Trash2 className="h-4 w-4"/></Button></div></td></tr>)}</tbody></table></div>}
    </Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir={ar?"rtl":"ltr"}><DialogHeader><DialogTitle>{editing?(ar?"تعديل رمز الخصم":"Edit Promo Code"):(ar?"إنشاء رمز خصم":"Create Promo Code")}</DialogTitle></DialogHeader><div className="space-y-4">
      <div><Label>{ar?"اسم الرمز":"Code Name"}</Label><Input value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="EID20" className="uppercase" maxLength={32}/></div>
      <div><Label>{ar?"نوع الخصم":"Discount Type"}</Label><Select value={form.discount_type} onValueChange={(v:"percentage"|"fixed")=>setForm({...form,discount_type:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="percentage">{ar?"نسبة مئوية %":"Percentage %"}</SelectItem><SelectItem value="fixed">{ar?"مبلغ ثابت د.ب":"Fixed Amount BHD"}</SelectItem></SelectContent></Select></div>
      <div><Label>{ar?"قيمة الخصم":"Discount Value"}</Label><Input type="number" min="0" max={form.discount_type==="percentage"?100:undefined} step={form.discount_type==="fixed"?"0.001":"0.01"} value={form.discount_value||""} onChange={e=>setForm({...form,discount_value:Number(e.target.value)})}/><p className="mt-1 text-xs text-muted-foreground">{form.discount_type==="fixed"?(ar?"يُحفظ بثلاث خانات عشرية.":"Saved with three decimal places."):(ar?"من 1 إلى 100%":"From 1 to 100%")}</p></div>
      <div><Label>{ar?"الحد الأدنى للطلب (اختياري)":"Minimum Order Amount (Optional)"}</Label><Input type="number" min="0" step="0.001" value={form.minimum_order_amount??""} onChange={e=>setForm({...form,minimum_order_amount:e.target.value===""?null:Number(e.target.value)})} placeholder="0.000"/></div>
      <div className="flex items-center justify-between rounded-lg border p-4"><div><div className="font-medium">{ar?"نشط":"Active"}</div><div className="text-xs text-muted-foreground">{ar?"يمكن للعملاء استخدام هذا الرمز.":"Customers can apply this code."}</div></div><Switch checked={form.is_active} onCheckedChange={v=>setForm({...form,is_active:v})}/></div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setOpen(false)}>{ar?"إلغاء":"Cancel"}</Button><Button onClick={save} disabled={saving}>{saving?(ar?"جارٍ الحفظ…":"Saving…"):(ar?"حفظ الرمز":"Save Promo")}</Button></div>
    </div></DialogContent></Dialog>
  </div>;
}
