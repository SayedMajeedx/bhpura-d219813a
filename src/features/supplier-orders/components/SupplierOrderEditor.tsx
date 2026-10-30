import type { SupplierOrderForm } from "../lib/order-form";
import { useId, useMemo, useState } from "react";
import { PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { piecesLabel, type SupplierOrder } from "../lib/order-state";
import type { SupplierCatalog } from "../hooks/use-supplier-catalog";
import { useSupplierOrderEditor } from "../hooks/use-supplier-order-editor";
import { usePhoneBottomBar } from "../hooks/use-phone-bottom-bar";
import { ProductLinesCard } from "./ProductLinesCard";
import { ProductPickerDialog } from "./ProductPickerDialog";
import { NewProductDialog } from "./NewProductDialog";
import { BillTotalCard } from "./BillTotalCard";
import { SupplierField } from "./SupplierField";

/**
 * Writing a supplier's order: who it is from and when it is due, each product at its cost per
 * piece with how many of each size, and the order's other costs (fabric the store bought,
 * delivery), which each piece's cost takes its share of.
 */
export function SupplierOrderEditor({
  brandId,
  order,
  catalog,
  currency,
  moneyLabel,
  lang,
  onSaved,
  onCancel,
  startWith,
}: {
  brandId: string;
  order: SupplierOrder | null;
  catalog: SupplierCatalog;
  /** A new order's first lines (the sizes chosen to order again). */
  startWith?: SupplierOrderForm | null;
  currency: string;
  moneyLabel: string;
  lang: "ar" | "en";
  onSaved: (orderId: string) => void;
  onCancel: () => void;
}) {
  const isAr = lang === "ar";
  const uid = useId();
  const editor = useSupplierOrderEditor({ brandId, order, catalog, lang, onSaved, startWith });
  const { form, setForm, figures, problems } = editor;
  const [picking, setPicking] = useState(false);
  // A product not in the store yet: the name typed in the search, while its dialog is open.
  const [newProductName, setNewProductName] = useState<string | null>(null);
  // A saved order's total is its bill (the rest of the bill is one of its lines).
  const [billText, setBillText] = useState(() =>
    order && order.total_amount > 0 ? String(order.total_amount) : "",
  );
  const priceOf = (productId: string) =>
    Number(catalog.productById.get(productId)?.base_price ?? 0) || 0;
  // A customer's piece of a product does not stop the store ordering that product for stock.
  const taken = useMemo(
    () => new Set(form.products.filter((p) => !p.customer).map((p) => p.productId)),
    [form.products],
  );
  const isNew = !order;
  const canDraft = isNew;
  usePhoneBottomBar("supplier-order-editor");

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
        <SupplierField
          brandId={brandId}
          value={form.vendorId}
          onChange={(vendorId) => setForm((f) => ({ ...f, vendorId }))}
          invalid={problems.some((p) => p.field === "vendor")}
          lang={lang}
        />
        <div className="space-y-1">
          <Label htmlFor={`${uid}-due`}>
            {isAr ? "موعد الوصول المتفق عليه" : "Promised delivery date"}
          </Label>
          <Input
            id={`${uid}-due`}
            type="date"
            value={form.expectedAt}
            onChange={(e) => setForm((f) => ({ ...f, expectedAt: e.target.value }))}
          />
        </div>
      </Card>

      <section className="space-y-2" aria-labelledby={`${uid}-pieces`}>
        <div className="flex items-center justify-between gap-2">
          <h2 id={`${uid}-pieces`} className="font-bold">
            {isAr ? "القطع المطلوبة" : "Pieces ordered"}
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {isAr ? "إضافة منتج" : "Add product"}
          </Button>
        </div>
        {form.products.length === 0 ? (
          <div
            className={cn(
              "space-y-3 rounded-xl border-2 border-dashed border-border p-4 text-sm sm:p-5",
              problems.some((p) => p.field === "pieces") && "border-destructive/60",
            )}
          >
            <ol className="space-y-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">1.</strong>{" "}
                {isAr
                  ? "أضف المنتج الذي طلبته: من منتجات متجرك، أو منتجاً جديداً لم يدخل المتجر بعد."
                  : "Add the product you ordered: one of your store's, or a new one that is not in it yet."}
              </li>
              <li>
                <strong className="text-foreground">2.</strong>{" "}
                {isAr
                  ? "اكتب تكلفة القطعة عليك، وكم قطعة من كل مقاس."
                  : "Type what one piece costs you, and how many of each size."}
              </li>
              <li>
                <strong className="text-foreground">3.</strong>{" "}
                {isAr
                  ? "أو اكتب إجمالي فاتورة المورد بالأسفل، ويوزّعه النظام على القطع."
                  : "Or type the supplier's bill total below, and it is shared over the pieces."}
              </li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setPicking(true)} className="gap-1.5">
                <Search className="h-4 w-4" aria-hidden="true" />
                {isAr ? "من منتجاتي" : "From my products"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewProductName("")}
                className="gap-1.5"
              >
                <PackagePlus className="h-4 w-4" aria-hidden="true" />
                {isAr ? "منتج جديد" : "New product"}
              </Button>
            </div>
          </div>
        ) : (
          form.products.map((product) => (
            <ProductLinesCard
              key={product.key}
              product={product}
              catalog={catalog}
              problems={problems}
              perPiece={figures.extras > 0 ? figures.perPiece.get(product.key) : undefined}
              currency={currency}
              moneyLabel={moneyLabel}
              lang={lang}
              onChange={(next) => editor.setProduct(product.key, next)}
              onRemove={() => editor.removeProduct(product.key)}
            />
          ))
        )}
      </section>

      <BillTotalCard
        form={form}
        onForm={(next) => setForm(next)}
        billText={billText}
        onBillText={setBillText}
        priceOf={priceOf}
        currency={currency}
        moneyLabel={moneyLabel}
        lang={lang}
      />

      <Card className="space-y-2 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-bold">{isAr ? "تكاليف أخرى" : "Other costs"}</h2>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "خامات اشتريتها بنفسك، توصيل، أو سعر للدفعة كاملة: يُوزَّع على القطع لتكون تكلفة كل قطعة حقيقية."
                : "Material you bought, delivery, or one price for the whole batch: shared over the pieces so each piece's cost is real."}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={editor.addCost}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {isAr ? "إضافة" : "Add"}
          </Button>
        </div>
        {form.costs.map((extra, index) => {
          const bad = problems.some((p) => p.field === "extra" && p.key === extra.key);
          return (
            <div key={extra.key} className="flex min-w-0 items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor={`${uid}-extra-${index}`} className="text-xs">
                  {isAr ? "الوصف" : "What for"}
                </Label>
                <Input
                  id={`${uid}-extra-${index}`}
                  value={extra.description}
                  onChange={(e) => editor.setCost(extra.key, { description: e.target.value })}
                  placeholder={isAr ? "قماش كريب" : "Crepe fabric"}
                  aria-invalid={bad || undefined}
                />
              </div>
              <div className="w-28 shrink-0 space-y-1">
                <Label htmlFor={`${uid}-extra-amount-${index}`} className="text-xs">
                  {isAr ? `المبلغ (${moneyLabel})` : `Amount (${moneyLabel})`}
                </Label>
                <Input
                  id={`${uid}-extra-amount-${index}`}
                  inputMode="decimal"
                  value={extra.amount}
                  onChange={(e) => editor.setCost(extra.key, { amount: e.target.value })}
                  aria-invalid={bad || undefined}
                  className="font-mono tabular-nums"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => editor.removeCost(extra.key)}
                aria-label={isAr ? `حذف التكلفة ${index + 1}` : `Remove cost ${index + 1}`}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </Card>

      <Card className="space-y-3 p-3 sm:p-4">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-notes`}>{isAr ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
          <Textarea
            id={`${uid}-notes`}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            maxLength={2000}
            placeholder={
              isAr ? "الخامة، الموديل، أي اتفاق مع المورد" : "Material, model, anything agreed"
            }
          />
        </div>
        {isNew && (
          <div className="space-y-1">
            <Label htmlFor={`${uid}-paid`}>
              {isAr ? `دفعت مقدماً (${moneyLabel})` : `Paid up front (${moneyLabel})`}
            </Label>
            <Input
              id={`${uid}-paid`}
              inputMode="decimal"
              value={editor.paidNow}
              onChange={(e) => editor.setPaidNow(e.target.value)}
              placeholder="0"
              aria-invalid={editor.paidProblem || undefined}
              className="max-w-40 font-mono tabular-nums"
            />
            {editor.paidProblem && (
              <p className="text-xs text-destructive">
                {isAr
                  ? `اكتب مبلغاً لا يزيد على إجمالي الطلبية (${formatMoney(figures.total, currency, lang)}).`
                  : `Type an amount up to the order's total (${formatMoney(figures.total, currency, lang)}).`}
              </p>
            )}
          </div>
        )}
      </Card>

      <div className="sticky bottom-0 z-10 -mx-2 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {piecesLabel(figures.pieces, lang)} · {isAr ? "الإجمالي" : "Total"}
            </p>
            <p className="text-lg font-bold tabular-nums">
              {formatMoney(figures.total, currency, lang)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={editor.saving}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            {canDraft && (
              <Button
                type="button"
                variant="outline"
                onClick={() => editor.save(false)}
                disabled={editor.saving}
              >
                {isAr ? "حفظ كمسودة" : "Save as draft"}
              </Button>
            )}
            <Button type="button" onClick={() => editor.save(true)} disabled={editor.saving}>
              {isNew
                ? isAr
                  ? "حفظ الطلبية"
                  : "Save order"
                : isAr
                  ? "حفظ التعديلات"
                  : "Save changes"}
            </Button>
          </div>
        </div>
      </div>

      <ProductPickerDialog
        open={picking}
        onOpenChange={setPicking}
        catalog={catalog}
        taken={taken}
        lang={lang}
        onPick={(productId) => {
          editor.addProduct(productId);
          setPicking(false);
        }}
        onNewProduct={(name) => {
          setPicking(false);
          setNewProductName(name);
        }}
      />
      <NewProductDialog
        open={newProductName !== null}
        onOpenChange={(open) => !open && setNewProductName(null)}
        brandId={brandId}
        startName={newProductName ?? ""}
        catalogVariants={catalog.variants}
        moneyLabel={moneyLabel}
        lang={lang}
        onCreated={(productId) => editor.addProduct(productId)}
      />
    </div>
  );
}
