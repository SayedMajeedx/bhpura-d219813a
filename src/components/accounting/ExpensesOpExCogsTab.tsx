import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Wallet,
  Receipt,
  Calendar,
  Layers,
  Sparkles,
  Building2,
  Repeat,
  Info,
} from "lucide-react";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "sonner";

export function ExpensesOpExCogsTab() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const brandId = brand.id;
  const qc = useQueryClient();

  const [activeTypeFilter, setActiveTypeFilter] = useState<"all" | "cogs" | "opex">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any | null>(null);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState("Operations");
  const [expenseType, setExpenseType] = useState<"cogs" | "opex">("opex");
  const [quantity, setQuantity] = useState<number>(100);
  const [unitType, setUnitType] = useState<string>("أكياس");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePeriod, setRecurrencePeriod] = useState<"monthly" | "yearly">("monthly");
  const [vendorId, setVendorId] = useState<string>("");
  const [expenseDate, setExpenseDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [isSaving, setIsSaving] = useState(false);

  const calculatedUnitCost =
    expenseType === "cogs" && quantity > 0 ? amount / quantity : 0;

  // Fetch expenses
  const expensesQ = useQuery({
    queryKey: ["dashboard-expenses-full", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("expenses")
        .select("*, vendors(name)")
        .eq("brand_id", brandId)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Fetch vendors
  const vendorsQ = useQuery({
    queryKey: ["vendors", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vendors")
        .select("id, name")
        .eq("brand_id", brandId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rawExpenses: any[] = expensesQ.data ?? [];
  const vendors: any[] = vendorsQ.data ?? [];

  const filteredExpenses = rawExpenses.filter((e) => {
    if (activeTypeFilter === "all") return true;
    return (e.expense_type || "opex") === activeTypeFilter;
  });

  const totalCogsAmount = rawExpenses
    .filter((e) => e.expense_type === "cogs")
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const totalOpexAmount = rawExpenses
    .filter((e) => (e.expense_type || "opex") === "opex")
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);


  const handleOpenAdd = () => {
    setEditingExpense(null);
    setDescription("");
    setAmount(0);
    setCategory("Packaging");
    setExpenseType("opex");
    setQuantity(100);
    setUnitType(isAr ? "أكياس" : "Bags");
    setIsRecurring(false);
    setRecurrencePeriod("monthly");
    setVendorId("");
    setExpenseDate(new Date().toISOString().split("T")[0]);
    setModalOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    setEditingExpense(item);
    setDescription(item.description || "");
    setAmount(Number(item.amount || 0));
    setCategory(item.category || "Operations");
    setExpenseType(item.expense_type === "cogs" ? "cogs" : "opex");
    setQuantity(Number(item.quantity || 100));
    setUnitType(item.unit_type || (isAr ? "أكياس" : "Bags"));
    setIsRecurring(Boolean(item.is_recurring));
    setRecurrencePeriod(item.recurrence_period || "monthly");
    setVendorId(item.vendor_id || "");
    setExpenseDate(item.expense_date || new Date().toISOString().split("T")[0]);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(isAr ? "هل أنت تأكد من حذف هذا المصروف؟" : "Delete this expense?")) return;
    try {
      const { error } = await supabase.from("expenses").delete().eq("id", id).eq("brand_id", brandId);
      if (error) throw error;
      toast.success(isAr ? "تم الحذف بنجاح" : "Expense deleted");
      qc.invalidateQueries({ queryKey: ["dashboard-expenses-full", brandId] });
      qc.invalidateQueries({ queryKey: ["dashboard-expenses", brandId] });
      qc.invalidateQueries({ queryKey: ["expenses", brandId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const handleSave = async () => {
    if (!description.trim() || amount <= 0) {
      toast.error(isAr ? "يرجى إدخال الوصف والمبلغ بشكل صحيح" : "Please fill in description and amount");
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const payload: any = {
        brand_id: brandId,
        user_id: user?.id || null,
        description: description.trim(),
        amount: Number(amount) || 0,
        currency: "BHD",
        category,
        expense_type: expenseType,
        quantity: expenseType === "cogs" ? Math.max(1, quantity) : 1,
        unit_type: expenseType === "cogs" ? unitType : "pcs",
        unit_cost: expenseType === "cogs" ? calculatedUnitCost : amount,
        is_recurring: isRecurring,
        recurrence_period: recurrencePeriod,
        vendor_id: vendorId || null,
        expense_date: expenseDate,
      };

      if (editingExpense) {
        const { error } = await (supabase as any).from("expenses").update(payload).eq("id", editingExpense.id).eq("brand_id", brandId);
        if (error) throw error;
        toast.success(isAr ? "تم تعديل المصروف بنجاح" : "Expense updated");
      } else {
        const { error } = await (supabase as any).from("expenses").insert(payload);
        if (error) throw error;
        toast.success(isAr ? "تم إضافة المصروف بنجاح" : "Expense added");
      }

      qc.invalidateQueries({ queryKey: ["dashboard-expenses-full", brandId] });
      qc.invalidateQueries({ queryKey: ["dashboard-expenses", brandId] });
      qc.invalidateQueries({ queryKey: ["expenses", brandId] });
      setModalOpen(false);
    } catch (err: any) {
      console.error("Expense save error:", err);
      toast.error(err.message || "Error saving expense");
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border-border/80 bg-card flex flex-col justify-between">
          <span className="text-xs font-bold text-muted-foreground block">{isAr ? "إجمالي المصاريف" : "Total Expenses"}</span>
          <span className="text-xl font-extrabold text-foreground mt-1">
            {formatMoney(totalCogsAmount + totalOpexAmount, "BHD")}
          </span>
        </Card>

        <Card className="p-4 border-border/80 bg-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">{isAr ? "مصاريف إنتاج مباشرة (Direct COGS)" : "Direct COGS"}</span>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">
              COGS
            </Badge>
          </div>
          <span className="text-xl font-extrabold text-primary mt-1">
            {formatMoney(totalCogsAmount, "BHD")}
          </span>
        </Card>

        <Card className="p-4 border-border/80 bg-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">{isAr ? "مصاريف تشغيلية (OpEx / Overhead)" : "OpEx Overhead"}</span>
            <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px]">
              OpEx
            </Badge>
          </div>
          <span className="text-xl font-extrabold text-foreground mt-1">
            {formatMoney(totalOpexAmount, "BHD")}
          </span>
        </Card>
      </div>

      {/* Toolbar & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20 p-3 rounded-lg border border-border">
        <div className="flex items-center gap-1.5">
          <Button
            variant={activeTypeFilter === "all" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTypeFilter("all")}
            className="h-8 text-xs font-bold"
          >
            {isAr ? "الكل" : "All"}
          </Button>
          <Button
            variant={activeTypeFilter === "cogs" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTypeFilter("cogs")}
            className="h-8 text-xs font-bold"
          >
            {isAr ? "تكاليف مباشرة (COGS)" : "Direct COGS"}
          </Button>
          <Button
            variant={activeTypeFilter === "opex" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTypeFilter("opex")}
            className="h-8 text-xs font-bold"
          >
            {isAr ? "مصاريف تشغيلية (OpEx)" : "OpEx Overhead"}
          </Button>
        </div>

        <Button onClick={handleOpenAdd} className="h-8 text-xs font-bold gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {isAr ? "تسجيل مصروف جديد" : "Add Expense"}
        </Button>
      </div>

      {/* Expenses List */}
      {filteredExpenses.length === 0 ? (
        <Card className="p-8 text-center text-xs text-muted-foreground">
          {isAr ? "لا توجد مصاريف مسجلة لهذا التصنيف." : "No expenses recorded under this category."}
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filteredExpenses.map((exp) => {
            const isCogs = exp.expense_type === "cogs";
            const vendorName = exp.vendors?.name;

            return (
              <Card key={exp.id} className="p-3.5 border-border hover:border-border/80 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${isCogs ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <Receipt className="h-4 w-4" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{exp.description}</span>
                      <Badge variant="outline" className={`text-[10px] ${isCogs ? "border-primary/30 text-primary" : "border-border text-muted-foreground"}`}>
                        {isCogs ? "COGS" : "OpEx"}
                      </Badge>
                      {exp.is_recurring && (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <Repeat className="h-2.5 w-2.5" />
                          {isAr ? `دوري (${exp.recurrence_period === "yearly" ? "سنوي" : "شهري"})` : `Recurring (${exp.recurrence_period})`}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span>{formatDate(exp.expense_date)}</span>
                      <span>•</span>
                      <span>{exp.category}</span>
                      {isCogs && exp.quantity > 0 && exp.unit_cost > 0 && (
                        <>
                          <span>•</span>
                          <span className="font-semibold text-primary">
                            {exp.quantity} {exp.unit_type || (isAr ? "قطع" : "pcs")} ({formatMoney(exp.unit_cost, "BHD")}/{exp.unit_type || (isAr ? "قطعة" : "unit")})
                          </span>
                        </>
                      )}
                      {vendorName && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <Building2 className="h-3 w-3 text-primary" />
                            {vendorName}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-extrabold text-foreground">{formatMoney(exp.amount, "BHD")}</span>

                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(exp)} className="h-8 w-8">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(exp.id)} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Expense Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-lg w-[95vw] max-h-[85vh] sm:max-h-[90vh] flex flex-col rounded-2xl border border-border bg-card p-0 shadow-2xl overflow-hidden">
          <DialogHeader className="p-5 pb-3 pe-12 ps-5 border-b border-border/60 shrink-0 text-start">
            <DialogTitle className="text-base font-bold text-foreground text-start">
              {editingExpense ? (isAr ? "تعديل المصروف" : "Edit Expense") : isAr ? "تسجيل مصروف جديد" : "Record New Expense"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {/* Expense Classification Toggle */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isAr ? "نوع المصروف (تصنيف القوائم المالية)" : "Expense Type"}</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExpenseType("opex")}
                  className={`p-2.5 rounded-lg border text-center transition-all ${expenseType === "opex" ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground"}`}
                >
                  {isAr ? "مصاريف تشغيلية (OpEx)" : "OpEx / Overhead"}
                </button>
                <button
                  type="button"
                  onClick={() => setExpenseType("cogs")}
                  className={`p-2.5 rounded-lg border text-center transition-all ${expenseType === "cogs" ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground"}`}
                >
                  {isAr ? "تكاليف إنتاج مباشرة (COGS)" : "Direct COGS"}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isAr ? "وصف المصروف" : "Expense Description"}</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isAr ? "مثال: أكياس تغليف مخملية / بطاقات شكر" : "e.g. Premium Velvet Bags"}
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{isAr ? "المبلغ الإجمالي (BHD)" : "Total Amount (BHD)"}</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs font-mono font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{isAr ? "تاريخ المصروف" : "Date"}</Label>
                <Input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Dynamic COGS Fields: Quantity & Unit Type */}
            {expenseType === "cogs" && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-primary flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    {isAr ? "تفاصيل حساب تكلفة القطعة المباشرة" : "Unit Cost Breakdown"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold">{isAr ? "الكمية / Quantity" : "Quantity"}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                      className="h-8 text-xs font-mono bg-background"
                      placeholder="e.g. 100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold">{isAr ? "الوحدة / Unit Type" : "Unit Type"}</Label>
                    <select
                      value={unitType}
                      onChange={(e) => setUnitType(e.target.value)}
                      className="h-8 text-xs w-full rounded-md border border-input bg-background px-2"
                    >
                      <option value="أكياس">{isAr ? "أكياس (Bags)" : "Bags"}</option>
                      <option value="بطاقات">{isAr ? "بطاقات (Cards)" : "Cards"}</option>
                      <option value="علب">{isAr ? "علب (Boxes)" : "Boxes"}</option>
                      <option value="قطع">{isAr ? "قطع (Pieces)" : "Pieces"}</option>
                      <option value="كيلو">{isAr ? "كيلو (Kg)" : "Kg"}</option>
                      <option value="وحدات">{isAr ? "وحدات (Units)" : "Units"}</option>
                    </select>
                  </div>
                </div>

                {/* Dynamic Calculation Live Display Badge */}
                <div className="rounded-md border border-primary/20 bg-background/80 p-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground text-[11px] font-medium">
                    {isAr ? "تكلفة القطعة الواحدة الحسابية:" : "Calculated Unit Cost:"}
                  </span>
                  <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary font-bold text-xs py-0.5 px-2.5">
                    {isAr
                      ? `تكلفة القطعة الواحدة: ${formatMoney(calculatedUnitCost, "BHD")}`
                      : `Unit Cost: ${formatMoney(calculatedUnitCost, "BHD")}`}
                  </Badge>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{isAr ? "التصنيف" : "Category"}</Label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-9 text-xs w-full rounded-md border border-input bg-background px-2"
                >
                  <option value="Packaging">{isAr ? "تغليف ومواد" : "Packaging"}</option>
                  <option value="Operations">{isAr ? "تشغيل ومرافق" : "Operations"}</option>
                  <option value="Rent">{isAr ? "إيجار وحاضنة" : "Rent & Incubator"}</option>
                  <option value="Marketing">{isAr ? "تسويق وإعلانات" : "Marketing"}</option>
                  <option value="Salaries">{isAr ? "رواتب وأجور" : "Salaries"}</option>
                  <option value="Other">{isAr ? "أخرى" : "Other"}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{isAr ? "المورد / الشركة" : "Vendor"}</Label>
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="h-9 text-xs w-full rounded-md border border-input bg-background px-2"
                >
                  <option value="">{isAr ? "-- بدون مورد --" : "-- No Vendor --"}</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Recurring Expense Toggle */}
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="rounded border-input text-primary"
                  />
                  <span className="font-bold text-xs text-foreground">{isAr ? "مصروف دوري مكرر (مصروف ثابت)" : "Recurring Expense"}</span>
                </label>

                {isRecurring && (
                  <select
                    value={recurrencePeriod}
                    onChange={(e) => setRecurrencePeriod(e.target.value as any)}
                    className="h-7 text-xs rounded border border-input bg-background px-1.5"
                  >
                    <option value="monthly">{isAr ? "شهرياً" : "Monthly"}</option>
                    <option value="yearly">{isAr ? "سنوياً" : "Yearly"}</option>
                  </select>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isAr ? "مثل رسوم الاشتراك بالحاضنة أو الإيجار الشهري لتتبع الالتزامات المستقبلية." : "For fixed recurring obligations like monthly incubator fees or rent."}
              </p>
            </div>
          </div>

          <DialogFooter className="p-4 pt-3 border-t border-border/60 shrink-0 bg-muted/20 gap-2 flex-row justify-end">
            <Button variant="outline" onClick={() => setModalOpen(false)} className="h-9 text-xs">
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="h-9 text-xs font-bold min-w-[100px]">
              {isSaving ? (isAr ? "جاري الحفظ..." : "Saving...") : isAr ? "حفظ المصروف" : "Save Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

