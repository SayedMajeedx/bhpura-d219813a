import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
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
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/discounts")({ component: DiscountCodes });

type Promo = {
  id: string; brand_id: string; code: string; discount_type: "percentage" | "fixed";
  discount_value: number; minimum_order_amount: number | null; maximum_discount_amount: number | null;
  first_time_customers_only: boolean; exclude_sale_items: boolean; usage_limit_per_customer: number | null;
  is_active: boolean; created_at: string;
  exclude_low_margin: boolean; margin_threshold: number;
};

type PromoForm = Omit<Promo, "id" | "brand_id" | "created_at">;

const EMPTY: PromoForm = {
  code: "", discount_type: "percentage", discount_value: 0, minimum_order_amount: null,
  maximum_discount_amount: null, first_time_customers_only: false, exclude_sale_items: false,
  usage_limit_per_customer: null, is_active: true, exclude_low_margin: false, margin_threshold: 20,
};

function DiscountCodes() {
  const brand = useBrand();
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [form, setForm] = useState<PromoForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [showMarginWarning, setShowMarginWarning] = useState(false);

  const settingsQ = useQuery({
    queryKey: ["business-settings-currency", brand.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("currency")
        .eq("brand_id", brand.id)
        .maybeSingle();
      if (error) throw error;
      return data ?? { currency: "BHD" };
    },
  });
  const currency = settingsQ.data?.currency ?? "BHD";

  const getCurrencyPrecision = (curr: string) => {
    const c = (curr || "").toUpperCase();
    if (["BHD", "KWD", "OMR", "JOD"].includes(c)) return 3;
    if (["JPY"].includes(c)) return 0;
    return 2;
  };

  const promos = useQuery({
    queryKey: ["promo-codes", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("promo_codes" as any) as any)
        .select("id,brand_id,code,discount_type,discount_value,minimum_order_amount,maximum_discount_amount,first_time_customers_only,exclude_sale_items,usage_limit_per_customer,is_active,created_at,exclude_low_margin,margin_threshold")
        .eq("brand_id", brand.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Promo[];
    },
  });

  const variantsQ = useQuery({
    queryKey: ["discounts-product-variants", brand.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, selling_price, cost_price")
        .eq("brand_id", brand.id);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; selling_price: number; cost_price: number }>;
    },
  });

  // Debounced real-time profit margin evaluation to protect bottom-line during typing
  useEffect(() => {
    if (form.discount_type !== "percentage" || !form.discount_value) {
      setShowMarginWarning(false);
      return;
    }
    const timer = setTimeout(() => {
      const variantsList = variantsQ.data ?? [];
      const val = Number(form.discount_value);
      if (isNaN(val) || val <= 0 || val > 100) {
        setShowMarginWarning(false);
        return;
      }
      const hasLowMargin = variantsList.some((v) => {
        const sell = Number(v.selling_price || 0);
        const cost = Number(v.cost_price || 0);
        if (sell <= 0 || cost <= 0) return false;
        const discountedSelling = sell * (1 - val / 100);
        if (discountedSelling <= 0) return true;
        const margin = ((discountedSelling - cost) / discountedSelling) * 100;
        return margin < 15;
      });
      setShowMarginWarning(hasLowMargin);
    }, 200);

    return () => clearTimeout(timer);
  }, [form.discount_type, form.discount_value, variantsQ.data]);

  const beginCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  
  const beginEdit = (p: Promo) => {
    setEditing(p);
    setForm({
      code: p.code,
      discount_type: p.discount_type,
      discount_value: p.discount_value,
      minimum_order_amount: p.minimum_order_amount,
      maximum_discount_amount: p.maximum_discount_amount,
      first_time_customers_only: p.first_time_customers_only,
      exclude_sale_items: p.exclude_sale_items,
      usage_limit_per_customer: p.usage_limit_per_customer,
      is_active: p.is_active,
      exclude_low_margin: p.exclude_low_margin ?? false,
      margin_threshold: p.margin_threshold ?? 20,
    });
    setOpen(true);
  };

  const save = async () => {
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,32}$/.test(code)) return toast.error(ar ? "استخدم حروفاً وأرقاماً فقط (2–32)" : "Use 2–32 letters, numbers, hyphens, or underscores");
    if (!(form.discount_value > 0) || (form.discount_type === "percentage" && form.discount_value > 100)) return toast.error(ar ? "قيمة الخصم غير صحيحة" : "Enter a valid discount value");
    if (form.maximum_discount_amount != null && form.maximum_discount_amount <= 0) return toast.error(ar ? "يجب أن يكون الحد الأقصى للخصم أكبر من صفر" : "Maximum discount must be greater than zero");
    if (form.usage_limit_per_customer != null && (!Number.isInteger(form.usage_limit_per_customer) || form.usage_limit_per_customer < 1)) return toast.error(ar ? "حد الاستخدام يجب أن يكون رقماً صحيحاً موجباً" : "Usage limit must be a positive whole number");
    setSaving(true);
    const payload = {
      ...form, code, brand_id: brand.id,
      discount_value: Number(form.discount_value.toFixed(3)),
      minimum_order_amount: form.minimum_order_amount == null ? null : Number(form.minimum_order_amount.toFixed(3)),
      maximum_discount_amount: form.discount_type === "percentage" && form.maximum_discount_amount != null ? Number(form.maximum_discount_amount.toFixed(3)) : null,
      margin_threshold: Number(form.margin_threshold),
      updated_at: new Date().toISOString(),
    };
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
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b bg-muted/50"><tr>{[ar?"الرمز":"Code",ar?"النوع":"Type",ar?"القيمة":"Value",ar?"الحد الأدنى":"Minimum",ar?"الحالة":"Status",ar?"الإجراءات":"Actions"].map(x=><th key={x} className="px-4 py-3 text-start font-medium">{x}</th>)}</tr></thead><tbody>{promos.data.map(p=><tr key={p.id} className="border-b last:border-0"><td className="px-4 py-4 font-mono font-semibold">{p.code}</td><td className="px-4 py-4">{p.discount_type === "percentage" ? (ar?"نسبة مئوية":"Percentage") : (ar?`مبلغ ثابت (${currency})`:`Fixed ${currency}`)}</td><td className="px-4 py-4 tabular-nums">{p.discount_type === "percentage" ? `${p.discount_value}%` : formatMoney(Number(p.discount_value), currency, lang)}</td><td className="px-4 py-4 tabular-nums">{p.minimum_order_amount == null ? "—" : formatMoney(Number(p.minimum_order_amount), currency, lang)}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${p.is_active?"bg-emerald-100 text-emerald-800":"bg-muted text-muted-foreground"}`}>{p.is_active?(ar?"نشط":"Active"):(ar?"متوقف":"Inactive")}</span></td><td className="px-4 py-4"><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={()=>beginEdit(p)} aria-label="Edit"><Pencil className="h-4 w-4"/></Button><Button size="icon" variant="ghost" className="text-destructive" onClick={()=>remove(p)} aria-label="Delete"><Trash2 className="h-4 w-4"/></Button></div></td></tr>)}</tbody></table></div>}
    </Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" dir={ar?"rtl":"ltr"}><DialogHeader><DialogTitle>{editing?(ar?"تعديل رمز الخصم":"Edit Promo Code"):(ar?"إنشاء رمز خصم":"Create Promo Code")}</DialogTitle></DialogHeader><div className="space-y-4">
      <div><Label>{ar?"اسم الرمز":"Code Name"}</Label><Input value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="EID20" className="uppercase" maxLength={32}/></div>
      <div><Label>{ar?"نوع الخصم":"Discount Type"}</Label><Select value={form.discount_type} onValueChange={(v:"percentage"|"fixed")=>setForm({...form,discount_type:v,maximum_discount_amount:v==="percentage"?form.maximum_discount_amount:null})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="percentage">{ar?"نسبة مئوية %":"Percentage %"}</SelectItem><SelectItem value="fixed">{ar?`مبلغ ثابت (${currency})`:`Fixed Amount ${currency}`}</SelectItem></SelectContent></Select></div>
      <div>
        <Label>{ar?"قيمة الخصم":"Discount Value"}</Label>
        <Input type="number" min="0" max={form.discount_type==="percentage"?100:undefined} step={form.discount_type==="fixed"?(getCurrencyPrecision(currency)===3?"0.001":"0.01"):"0.01"} value={form.discount_value||""} onChange={e=>setForm({...form,discount_value:Number(e.target.value)})}/>
        {showMarginWarning && (
          <div className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50 p-2.5 text-xs font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400 flex items-center gap-1.5 animate-pulse">
            <span>⚠️ {ar ? "هذه القيمة تقلل هامش الربح لبعض المنتجات عن 15%." : "This value cuts into profit margins for certain collections."}</span>
          </div>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{form.discount_type==="fixed"?(ar?`يُحفظ بـ ${getCurrencyPrecision(currency)} خانات عشرية.`:`Saved with ${getCurrencyPrecision(currency)} decimal places.`):(ar?"من 1 إلى 100%":"From 1 to 100%")}</p>
      </div>
      <div><Label>{ar?`الحد الأدنى للطلب (${currency}) (اختياري)`:`Minimum Order Amount (${currency}) (Optional)`}</Label><Input type="number" min="0" step={getCurrencyPrecision(currency)===3?"0.001":"0.01"} value={form.minimum_order_amount??""} onChange={e=>setForm({...form,minimum_order_amount:e.target.value===""?null:Number(e.target.value)})} placeholder={getCurrencyPrecision(currency)===3?"0.000":"0.00"}/></div>
      {form.discount_type === "percentage" && <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-4"><div><div className="font-medium">{ar?"تحديد حد أقصى للخصم":"Set maximum discount limit"}</div><div className="text-xs text-muted-foreground">{ar?"يمنع الخصم النسبي من تجاوز مبلغ محدد.":"Prevent a percentage discount from exceeding a fixed amount."}</div></div><Switch checked={form.maximum_discount_amount!=null} onCheckedChange={v=>setForm({...form,maximum_discount_amount:v?0.01:null})}/></div>
        {form.maximum_discount_amount != null && <div><Label>{ar?`الحد الأقصى للخصم (${currency})`:`Maximum Discount Amount (${currency})`}</Label><Input type="number" min="0.01" step={getCurrencyPrecision(currency)===3?"0.001":"0.01"} value={form.maximum_discount_amount} onChange={e=>setForm({...form,maximum_discount_amount:Number(e.target.value)})} placeholder={getCurrencyPrecision(currency)===3?"0.000":"0.00"}/></div>}
      </div>}
      <div className="space-y-3 rounded-lg border p-4">
        <div><div className="font-medium">{ar?"شروط الأهلية":"Eligibility Constraints"}</div><div className="text-xs text-muted-foreground">{ar?"حدد العملاء والمنتجات المؤهلة لهذا الرمز.":"Control which customers and products qualify."}</div></div>
        <div className="flex items-center justify-between gap-4"><Label className="font-normal">{ar?"للعملاء الجدد فقط":"First-time customers only"}</Label><Switch checked={form.first_time_customers_only} onCheckedChange={v=>setForm({...form,first_time_customers_only:v})}/></div>
        <div className="flex items-center justify-between gap-4"><Label className="font-normal">{ar?"استبعاد المنتجات المخفضة مسبقاً":"Exclude items already on sale"}</Label><Switch checked={form.exclude_sale_items} onCheckedChange={v=>setForm({...form,exclude_sale_items:v})}/></div>
        
        {/* Margin Threshold Anchor */}
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-border/40">
          <Label className="font-normal">{ar ? "استبعاد المنتجات تلقائياً إذا انخفض هامش الربح" : "Auto-exclude items if profit margin drops below limit"}</Label>
          <Switch checked={form.exclude_low_margin} onCheckedChange={v => setForm({ ...form, exclude_low_margin: v })} />
        </div>
        {form.exclude_low_margin && (
          <div className="mt-2 flex items-center gap-3 rounded bg-secondary/30 p-2 border border-border/30">
            <Label className="text-xs shrink-0 font-medium">{ar ? "الحد الأدنى لهامش الربح (%)" : "Margin threshold (%)"}</Label>
            <Input type="number" min="0" max="100" className="h-8 w-24 text-center text-xs font-mono font-medium" value={form.margin_threshold} onChange={e => setForm({ ...form, margin_threshold: Number(e.target.value) })} />
          </div>
        )}
      </div>
      <div><Label>{ar?"إجمالي مرات الاستخدام لكل عميل (اختياري)":"Total usage limit per customer (Optional)"}</Label><Input type="number" min="1" step="1" value={form.usage_limit_per_customer??""} onChange={e=>setForm({...form,usage_limit_per_customer:e.target.value===""?null:Number(e.target.value)})} placeholder={ar?"مثال: 1":"e.g. 1"}/></div>
      <div className="flex items-center justify-between rounded-lg border p-4"><div><div className="font-medium">{ar?"نشط":"Active"}</div><div className="text-xs text-muted-foreground">{ar?"يمكن للعملاء استخدام هذا الرمز.":"Customers can apply this code."}</div></div><Switch checked={form.is_active} onCheckedChange={v=>setForm({...form,is_active:v})}/></div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setOpen(false)}>{ar?"إلغاء":"Cancel"}</Button><Button onClick={save} disabled={saving}>{saving?(ar?"جارٍ الحفظ…":"Saving…"):(ar?"حفظ الرمز":"Save Promo")}</Button></div>
    </div></DialogContent></Dialog>
  </div>;
}
