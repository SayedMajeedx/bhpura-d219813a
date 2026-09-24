import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Search, Boxes, Check } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";

import type { Product, Customization } from "@/features/inventory/types";
import { InventoryDeleteAction } from "@/features/inventory/components/InventoryDeleteAction";

export function CustomizationsSection({
  brandId,
  items,
  products,
  onChanged,
}: {
  brandId: string;
  items: Customization[];
  products: Product[];
  onChanged: () => void;
}) {
  const t = useT();
  const isAr = useI18n().lang === "ar";
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const [editingAddon, setEditingAddon] = useState<Customization | null>(null);
  const [editProductIds, setEditingProductIds] = useState<string[]>([]);
  const [editSearch, setEditSearch] = useState("");

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase().trim();
    return products.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)),
    );
  }, [products, productSearch]);

  const filteredEditProducts = useMemo(() => {
    if (!editSearch.trim()) return products;
    const q = editSearch.toLowerCase().trim();
    return products.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)),
    );
  }, [products, editSearch]);

  const toggleProductForNew = (pid: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid],
    );
  };

  const toggleProductForEdit = (pid: string) => {
    setEditingProductIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid],
    );
  };

  const add = async () => {
    if (!name.trim()) return;
    if (scope === "selected" && selectedProductIds.length === 0) {
      toast.error(
        isAr
          ? "يرجى اختيار منتج واحد على الأقل أو تحديد 'جميع المنتجات'"
          : "Please select at least one product or choose 'All products'",
      );
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await (supabase.from("customization_options") as any).insert({
      user_id: user.id,
      brand_id: brandId,
      name: name.trim(),
      price_delta: Number(price),
      product_ids: scope === "all" ? [] : selectedProductIds,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(isAr ? "تمت إضافة خيار التخصيص بنجاح" : "Customization add-on created");
      setName("");
      setPrice("0");
      setScope("all");
      setSelectedProductIds([]);
      onChanged();
    }
  };

  const saveProductScope = async () => {
    if (!editingAddon) return;
    const { error } = await (supabase.from("customization_options") as any)
      .update({
        product_ids: editProductIds,
      })
      .eq("id", editingAddon.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(isAr ? "تم تحديث المنتجات المخصصة للإضافة" : "Add-on products updated");
      setEditingAddon(null);
      onChanged();
    }
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("customization_options").delete().eq("id", id);
    if (error) toast.error(error.message);
    else onChanged();
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border border-border-subtle shadow-lg rounded-2xl bg-card p-6">
        <h3 className="font-bold text-base mb-1">
          {isAr ? "إضافة إضافات وتخصيصات جديدة" : "Add Customization Add-ons"}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">{t("inventory.addonsIntro")}</p>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4 items-end">
          <div className="md:col-span-6">
            <Label className="text-xs mb-1 block">{isAr ? "اسم الإضافة" : "Add-on Name"}</Label>
            <Input
              placeholder={t("inventory.addonName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs mb-1 block">{isAr ? "السعر الإضافي" : "Price Delta"}</Label>
            <Input
              type="number"
              step="0.01"
              placeholder={t("inventory.addonPrice")}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <Button onClick={add} className="w-full">
              <Plus className="h-4 w-4 me-1" />
              {isAr ? "إضافة للإضافة" : "Create Add-on"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle bg-muted/20 p-4 mb-4 space-y-3">
          <Label className="text-xs font-bold text-foreground block">
            {isAr ? "نطاق التطبيق (المنتجات المتاحة فيها هذه الإضافة):" : "Applies to Products:"}
          </Label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                scope === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background border border-border hover:bg-muted"
              }`}
            >
              🌐 {isAr ? "جميع المنتجات في المخزون" : "All Products"}
            </button>
            <button
              type="button"
              onClick={() => setScope("selected")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                scope === "selected"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background border border-border hover:bg-muted"
              }`}
            >
              🎯 {isAr ? "منتجات محددة فقط" : "Chosen Products Only"}{" "}
              {selectedProductIds.length > 0 && `(${selectedProductIds.length})`}
            </button>
          </div>

          {scope === "selected" && (
            <div className="mt-3 pt-3 border-t border-border-subtle space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="absolute start-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={isAr ? "ابحث باسم المنتج أو القسم..." : "Search product..."}
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="ps-9 h-8 text-xs rounded-lg"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    if (selectedProductIds.length === products.length) {
                      setSelectedProductIds([]);
                    } else {
                      setSelectedProductIds(products.map((p) => p.id));
                    }
                  }}
                >
                  {selectedProductIds.length === products.length
                    ? isAr
                      ? "إلغاء الكل"
                      : "Deselect All"
                    : isAr
                      ? "تحديد الكل"
                      : "Select All"}
                </Button>
              </div>

              <div className="max-h-48 overflow-y-auto divide-y divide-border/40 rounded-lg border border-border-subtle bg-background/80 p-1">
                {filteredProducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 text-center">
                    {isAr ? "لا توجد منتجات مطابقة" : "No matching products found"}
                  </p>
                ) : (
                  filteredProducts.map((p) => {
                    const isChecked = selectedProductIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        onClick={() => toggleProductForNew(p.id)}
                        className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt=""
                            className="h-7 w-7 rounded object-cover border border-border"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded bg-muted flex items-center justify-center text-xs">
                            📦
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{p.name}</p>
                          {p.category && (
                            <p className="text-xs text-muted-foreground">{p.category}</p>
                          )}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="pt-2">
          <h4 className="font-bold text-sm mb-3">
            {isAr ? "قائمة إضافات التخصيص المتاحة:" : "Existing Customization Add-ons"}
          </h4>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("inventory.noAddons")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border-subtle bg-background/50 overflow-hidden">
              {items.map((i) => {
                const pIds = Array.isArray(i.product_ids) ? i.product_ids : [];
                const isAll = pIds.length === 0;

                return (
                  <li
                    key={i.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{i.name}</p>
                        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          + {formatMoney(Number(i.price_delta))}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {isAll ? (
                          <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-medium">
                            🌐 {isAr ? "متاح لكل المنتجات" : "All products"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-amber-600 dark:text-amber-400 font-medium">
                            🎯{" "}
                            {isAr ? `${pIds.length} منتج محدد` : `${pIds.length} chosen products`}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-medium rounded-lg"
                        onClick={() => {
                          setEditingAddon(i);
                          setEditingProductIds(Array.isArray(i.product_ids) ? i.product_ids : []);
                          setEditSearch("");
                        }}
                      >
                        <Boxes className="h-3.5 w-3.5 me-1" />
                        {isAr ? "تخصيص المنتجات" : "Assign Products"}
                      </Button>

                      <InventoryDeleteAction
                        message={t("common.confirmDelete")}
                        onConfirm={() => del(i.id)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <Dialog open={!!editingAddon} onOpenChange={(open) => !open && setEditingAddon(null)}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" />
              {isAr
                ? `تحديد المنتجات المتاحة للإضافة: ${editingAddon?.name ?? ""}`
                : `Assign Products to: ${editingAddon?.name ?? ""}`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={isAr ? "ابحث باسم المنتج..." : "Search product..."}
                  value={editSearch}
                  onChange={(e) => setEditSearch(e.target.value)}
                  className="ps-9 text-xs rounded-xl"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => {
                  if (editProductIds.length === products.length) {
                    setEditingProductIds([]);
                  } else {
                    setEditingProductIds(products.map((p) => p.id));
                  }
                }}
              >
                {editProductIds.length === products.length
                  ? isAr
                    ? "إلغاء الكل"
                    : "Deselect All"
                  : isAr
                    ? "تحديد الكل"
                    : "Select All"}
              </Button>
            </div>

            <div className="flex items-center gap-2 text-xs mb-2">
              <button
                type="button"
                className={`px-3 py-1 rounded-md text-xs font-medium border ${
                  editProductIds.length === 0
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
                onClick={() => setEditingProductIds([])}
              >
                🌐 {isAr ? "تطبيق على جميع المنتجات" : "Apply to All Products"}
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-border/40 rounded-xl border border-border-subtle bg-card p-1">
              {filteredEditProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground p-4 text-center">
                  {isAr ? "لا توجد منتجات مطابقة" : "No matching products found"}
                </p>
              ) : (
                filteredEditProducts.map((p) => {
                  const isChecked = editProductIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      onClick={() => toggleProductForEdit(p.id)}
                      className="flex items-center gap-3 p-2.5 hover:bg-muted/40 rounded-lg cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt=""
                          className="h-8 w-8 rounded object-cover border border-border"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs">
                          📦
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{p.name}</p>
                        {p.category && (
                          <p className="text-xs text-muted-foreground">{p.category}</p>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingAddon(null)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={saveProductScope}>
              <Check className="h-4 w-4 me-1" />
              {isAr ? "حفظ التغييرات" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
