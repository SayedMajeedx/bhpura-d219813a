import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  categoriesKeys,
  categoriesQueries,
  createCategory,
  deleteCategory,
  invalidateCategories,
  setCategorySortOrders,
  updateCategory,
  type CategoryWithCounts,
} from "@/lib/data/categories";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Upload, Tags } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { CategoriesCommandHeader } from "@/components/categories/CategoriesCommandHeader";
import { CategoriesWorkQueue } from "@/components/categories/CategoriesWorkQueue";
import { CropUploadButton } from "@/components/crop-upload-button";
import { syncBrandVerticalCategories, PURA_BRAND_ID } from "@/lib/addons/vertical-categories";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import type { StoreVertical } from "@/lib/store-profile";
import { addonDataQueries } from "@/lib/data/addons";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/categories")({
  component: CategoriesPage,
});

type Category = CategoryWithCounts;

function slugify(v: string) {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function CategoriesPage() {
  const brand = useBrand();
  const brandId = brand.id;
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const { profile } = useAdminStoreProfile(brandId);
  const [isSyncingDefaults, setIsSyncingDefaults] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);

  useRealtimeInvalidate(
    [
      { table: "categories", brandId, queryKey: categoriesKeys.overview(brandId) },
      { table: "products", brandId, queryKey: categoriesKeys.overview(brandId) },
    ],
    `categories-${brandId}`,
  );

  const { data, isLoading } = useQuery(categoriesQueries.overview(brandId));

  const move = async (c: Category, dir: -1 | 1) => {
    const list = data ?? [];
    const index = list.findIndex((x) => x.id === c.id);
    const targetIndex = index + dir;
    if (index === -1 || targetIndex < 0 || targetIndex >= list.length) return;

    const targetCat = list[targetIndex];
    if (targetCat.sort_order === c.sort_order) {
      const reordered = [...list];
      reordered.splice(index, 1);
      reordered.splice(targetIndex, 0, c);
      await setCategorySortOrders(
        brandId,
        reordered.map((cat, idx) => ({ id: cat.id, sort_order: idx + 1 })),
      );
    } else {
      await setCategorySortOrders(brandId, [
        { id: c.id, sort_order: targetCat.sort_order },
        { id: targetCat.id, sort_order: c.sort_order },
      ]);
    }
    void invalidateCategories(qc, brandId);
  };

  const remove = async (c: Category) => {
    if (
      !confirm(
        isAr
          ? "حذف هذا القسم؟ سيتم التعطيل إذا كانت هناك منتجات مرتبطة."
          : "Delete this category? It will be deactivated if linked to products.",
      )
    )
      return;
    let mode: string | undefined;
    let linked = 0;
    try {
      ({ mode, linkedProducts: linked } = await deleteCategory(c.id));
    } catch (error) {
      return toast.error(getFriendlyErrorMessage(error));
    }
    if (mode === "soft")
      toast.success(
        isAr
          ? `تم التعطيل — مرتبط بـ ${linked} منتج`
          : `Deactivated — linked to ${linked} product(s)`,
      );
    else toast.success(isAr ? "تم الحذف" : "Deleted");
    void invalidateCategories(qc, brandId);
  };

  const handleSyncVerticalDefaults = async () => {
    if (brandId === PURA_BRAND_ID) {
      toast.info(
        isAr
          ? "براند Pura محمي من التعديل التلقائي للأقسام."
          : "Pura brand is protected from automated category changes.",
      );
      return;
    }

    const confirmed = window.confirm(
      isAr
        ? `هل تريد تهيئة أقسام المتجر الافتراضية لنشاطك؟\nسيتم استبدال الأقسام السابقة الفارغة (التي لا تحتوي على أي منتجات) بأقسام مناسبة لنشاطك، وتبقى الأقسام المرتبطة بمنتجات محفوظة دون أي مساس.`
        : `Do you want to initialize default categories for your store vertical?\nEmpty previous categories with zero products will be replaced, while all categories linked to existing products will be kept safe.`,
    );
    if (!confirmed) return;

    try {
      setIsSyncingDefaults(true);
      const targetVertical = (profile?.vertical as StoreVertical) || "general";
      const res = await syncBrandVerticalCategories({
        db: supabase,
        brandId,
        newVertical: targetVertical,
        replaceEmptyOldCategories: true,
      });

      toast.success(
        isAr
          ? `تمت تهيئة أقسام النشاط بنجاح (إضافة ${res.insertedCount}، حذف ${res.removedCount} قسم فارغ)`
          : `Categories initialized successfully (+${res.insertedCount}, -${res.removedCount} empty)`,
      );

      await invalidateCategories(qc, brandId);
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل تحديث الأقسام" : "Failed to sync categories"));
    } finally {
      setIsSyncingDefaults(false);
    }
  };

  return (
    <div
      className="mx-auto max-w-6xl space-y-4 p-1 sm:p-2 animate-fade-in"
      dir={isAr ? "rtl" : "ltr"}
    >
      <CategoriesCommandHeader
        lang={lang}
        categoryCount={(data ?? []).length}
        onSyncVerticalDefaults={handleSyncVerticalDefaults}
        isSyncingDefaults={isSyncingDefaults}
        onCreateNew={() => {
          setEditing(null);
          setOpen(true);
        }}
      />

      <CategoriesWorkQueue
        lang={lang}
        categories={data ?? []}
        isLoading={isLoading}
        onEdit={(cat) => {
          setEditing(cat);
          setOpen(true);
        }}
        onDelete={(id) => {
          const c = (data ?? []).find((x) => x.id === id);
          if (c) remove(c);
        }}
        onReorder={(id, dir) => {
          const c = (data ?? []).find((x) => x.id === id);
          if (c) move(c, dir === "up" ? -1 : 1);
        }}
      />

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <CategoryDialog
          brandId={brandId}
          category={editing}
          onSaved={() => {
            setOpen(false);
            setEditing(null);
            void invalidateCategories(qc, brandId);
          }}
        />
      </Dialog>
    </div>
  );
}

function CategoryDialog({
  brandId,
  category,
  onSaved,
}: {
  brandId: string;
  category: Category | null;
  onSaved: () => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const { data: categories = [] } = useQuery(categoriesQueries.list(brandId));

  const parentOptions = categories.filter((c) => c.id !== category?.id);
  const [form, setForm] = useState({
    name_en: category?.name_en ?? "",
    name_ar: category?.name_ar ?? "",
    parent_id: category?.parent_id ?? "",
    slug: category?.slug ?? "",
    image_url: category?.image_url ?? "",
    menu_icon_url: category?.menu_icon_url ?? "",
    sort_order: category?.sort_order ?? 0,
    is_active: category?.is_active ?? true,
    size_guide_id: category?.size_guide_id ?? "",
  });
  const [uploading, setUploading] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const iconInput = useRef<HTMLInputElement>(null);

  const { data: sizeGuides } = useQuery({
    ...addonDataQueries.sizeGuides(brandId),
    select: (rows) =>
      rows as Array<{ id: string; name_ar: string; name_en: string; is_default: boolean }>,
  });

  useEffect(() => {
    setForm({
      name_en: category?.name_en ?? "",
      name_ar: category?.name_ar ?? "",
      parent_id: category?.parent_id ?? "",
      slug: category?.slug ?? "",
      image_url: category?.image_url ?? "",
      menu_icon_url: category?.menu_icon_url ?? "",
      sort_order: category?.sort_order ?? 0,
      is_active: category?.is_active ?? true,
      size_guide_id: category?.size_guide_id ?? "",
    });
  }, [category]);

  const upload = async (file: Blob) => {
    try {
      setUploading(true);
      const url = await uploadPublicMedia(brandId, file, "category");
      setForm((f) => ({ ...f, image_url: url }));
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const uploadIcon = async (file: File) => {
    try {
      setUploadingIcon(true);
      const url = await uploadPublicMedia(brandId, file, "category");
      setForm((current) => ({ ...current, menu_icon_url: url }));
    } catch (error: any) {
      toast.error(error.message ?? "Icon upload failed");
    } finally {
      setUploadingIcon(false);
    }
  };

  const save = async () => {
    if (!form.name_en.trim())
      return toast.error(isAr ? "الاسم بالإنجليزي مطلوب" : "English name required");
    const payload = {
      brand_id: brandId,
      name_en: form.name_en.trim(),
      name_ar: form.name_ar.trim() || null,
      parent_id: form.parent_id || null,
      slug: form.slug.trim() || slugify(form.name_en) || null,
      image_url: form.image_url || null,
      menu_icon_url: form.menu_icon_url || null,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
      size_guide_id: form.size_guide_id || null,
    };
    try {
      if (category) await updateCategory(brandId, category.id, payload);
      else await createCategory(brandId, payload);
    } catch (error) {
      return toast.error(getFriendlyErrorMessage(error));
    }
    toast.success(isAr ? "تم الحفظ" : "Saved");
    onSaved();
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {category ? (isAr ? "تعديل قسم" : "Edit category") : isAr ? "قسم جديد" : "New category"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</Label>
            <Input
              value={form.name_ar}
              onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
              placeholder={isAr ? "المنتجات الأكثر طلباً" : ""}
            />
          </div>
          <div>
            <Label>{isAr ? "الاسم (إنجليزي)" : "Name (English)"}</Label>
            <Input
              value={form.name_en}
              onChange={(e) => setForm({ ...form, name_en: e.target.value })}
              placeholder="e.g. Featured / Best Sellers"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{isAr ? "المعرّف (Slug)" : "Slug"}</Label>
            <Input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder={slugify(form.name_en)}
            />
          </div>
          <div>
            <Label>{isAr ? "الترتيب" : "Sort order"}</Label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            />
          </div>
        </div>

        <div>
          <Label>{isAr ? "القسم الأب (الرئيسي)" : "Parent category (optional)"}</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={form.parent_id}
            onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
          >
            <option value="">{isAr ? "قسم رئيسي (بدون أب)" : "Main Category (No Parent)"}</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {isAr ? c.name_ar || c.name_en : c.name_en}
              </option>
            ))}
          </select>
        </div>

        {sizeGuides && sizeGuides.length > 0 && (
          <div>
            <Label>
              {isAr ? "دليل المقاسات الافتراضي للقسم" : "Default Size Guide for this category"}
            </Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={form.size_guide_id}
              onChange={(e) => setForm({ ...form, size_guide_id: e.target.value })}
            >
              <option value="">
                {isAr
                  ? "تلقائي (يتبع القسم الأب أو الافتراضي للمتجر)"
                  : "Automatic (Inherit from parent or store default)"}
              </option>
              {sizeGuides.map((g) => (
                <option key={g.id} value={g.id}>
                  {isAr ? g.name_ar : g.name_en}{" "}
                  {g.is_default ? (isAr ? "(الافتراضي)" : "(Default)") : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <Label>{isAr ? "صورة الغلاف" : "Cover image"}</Label>
          <div className="flex items-center gap-3">
            {form.image_url && (
              <img src={form.image_url} alt="" className="h-16 w-16 rounded object-cover border" />
            )}
            <div className="flex gap-2 flex-1">
              <Input
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://..."
              />
              <CropUploadButton
                onCrop={upload}
                preset="categoryCover"
                size="icon"
                busy={uploading}
                title={isAr ? "ضبط صورة القسم" : "Frame category image"}
                description={
                  isAr
                    ? "حرّك وكبّر الصورة داخل الإطار المربع."
                    : "Reposition and zoom for a clean square category image."
                }
              >
                <Upload className="h-4 w-4" />
              </CropUploadButton>
            </div>
          </div>
        </div>

        <div>
          <Label>{isAr ? "أيقونة القائمة (اختيارية)" : "Menu icon (optional)"}</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            {isAr
              ? "المقاس الموصى به: 128×128 بكسل، مربع — SVG أو PNG أو WebP"
              : "Recommended: 128×128px, square — SVG, PNG, or WebP"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted">
              {form.menu_icon_url ? (
                <img src={form.menu_icon_url} alt="" className="h-9 w-9 object-contain" />
              ) : (
                <Tags className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <Input
              className="min-w-48 flex-1"
              value={form.menu_icon_url}
              onChange={(event) => setForm({ ...form, menu_icon_url: event.target.value })}
              placeholder="https://..."
            />
            <input
              ref={iconInput}
              type="file"
              accept="image/svg+xml,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadIcon(file);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => iconInput.current?.click()}
              disabled={uploadingIcon}
            >
              <Upload className="h-4 w-4" />
              {uploadingIcon ? "…" : isAr ? "رفع" : "Upload"}
            </Button>
            {form.menu_icon_url && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setForm({ ...form, menu_icon_url: "" })}
              >
                {isAr ? "إزالة" : "Remove"}
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="active"
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          <Label htmlFor="active">{isAr ? "مفعّل في المتجر" : "Active in storefront"}</Label>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save}>{isAr ? "حفظ" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
