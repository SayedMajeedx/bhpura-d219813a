import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updateBrand } from "@/lib/data/brands";
import { useI18n, useT } from "@/lib/i18n";
import { META_DESCRIPTION_LIMIT, META_TITLE_LIMIT, sanitizeMetaText } from "@/lib/seo";
import { getFriendlyErrorMessage } from "@/lib/utils";

export type Brand = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  primary_color: string | null;
  about_ar: string | null;
  about_en: string | null;
  meta_title: string | null;
  meta_description: string | null;
  subscription_tier: "basic" | "growth" | "enterprise" | null;
  subscription_status: "active" | "pending_verification" | "suspended" | "trialing" | null;
  subscription_expires_at: string | null;
  payment_receipt_url: string | null;
  payment_receipt_uploaded_at: string | null;
  custom_domain: string | null;
  plan_type: "annual" | "monthly" | "lifetime" | "trial" | null;
  trial_ends_at: string | null;
  renewal_intent: "renew" | "cancel" | "upgrade" | "downgrade" | null;
  renewal_intent_recorded_at: string | null;
  support_access_enabled: boolean;
};

/** The super admin's edit of a store's details, names and search listing. */
export function EditBrandDialog({
  open,
  onOpenChange,
  brand,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand: Brand;
  onSaved: () => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [form, setForm] = useState({
    name_en: brand.name_en,
    name_ar: brand.name_ar ?? "",
    logo_url: brand.logo_url ?? "",
    primary_color: brand.primary_color ?? "#8b6f47",
    about_ar: brand.about_ar ?? "",
    about_en: brand.about_en ?? "",
    meta_title: brand.meta_title ?? "",
    meta_description: brand.meta_description ?? "",
    is_active: brand.is_active,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      name_en: brand.name_en,
      name_ar: brand.name_ar ?? "",
      logo_url: brand.logo_url ?? "",
      primary_color: brand.primary_color ?? "#8b6f47",
      about_ar: brand.about_ar ?? "",
      about_en: brand.about_en ?? "",
      meta_title: brand.meta_title ?? "",
      meta_description: brand.meta_description ?? "",
      is_active: brand.is_active,
    });
  }, [brand]);

  const save = async () => {
    if (!form.name_en.trim()) {
      toast.error(isAr ? "الاسم بالإنجليزية مطلوب" : "English name is required");
      return;
    }
    setSaving(true);
    try {
      await updateBrand(brand.id, {
        name_en: form.name_en.trim(),
        name_ar: form.name_ar.trim() || null,
        logo_url: form.logo_url.trim() || null,
        about_ar: form.about_ar.trim() || null,
        about_en: form.about_en.trim() || null,
        meta_title: sanitizeMetaText(form.meta_title, META_TITLE_LIMIT) || null,
        meta_description: sanitizeMetaText(form.meta_description, META_DESCRIPTION_LIMIT) || null,
        is_active: form.is_active,
      });
    } catch (error) {
      return toast.error(getFriendlyErrorMessage(error));
    } finally {
      setSaving(false);
    }
    toast.success(t("brands.updateSuccess"));
    onSaved();
  };

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} kind="form">
      <AppDialogHeader
        title={
          <>
            {t("brands.editTitle")} — {brand.name_en}
          </>
        }
      />

      <AppDialogBody>
        <div className="space-y-4">
          <div>
            <Label>{isAr ? "المعرّف" : "Slug"}</Label>
            <Input value={brand.slug} readOnly disabled />
            <p className="text-xs text-muted-foreground mt-1">
              {isAr
                ? "لا يمكن تغيير المعرّف لأنه مستخدم في الروابط والفواتير."
                : "Slug can't be changed — it's used in URLs and invoice links."}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{isAr ? "الاسم (إنجليزي)" : "Name (English)"}</Label>
              <Input
                value={form.name_en}
                onChange={(e) => setForm({ ...form, name_en: e.target.value })}
              />
            </div>
            <div>
              <Label>{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</Label>
              <Input
                value={form.name_ar}
                onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>{isAr ? "رابط الشعار" : "Logo URL"}</Label>
            <Input
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <div>
            <Label>{isAr ? "لون العلامة" : "Brand color"}</Label>
            <div className="flex items-center gap-2">
              <div
                className="h-9 w-12 rounded border border-border shrink-0"
                style={{ backgroundColor: form.primary_color || "#18181b" }}
              />
              <Input
                value={form.primary_color}
                readOnly
                disabled
                className="bg-muted text-muted-foreground font-mono"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isAr
                ? "يُشتق لون العلامة تلقائياً من لون واجهة المتجر (storefront_accent_color) في إعدادات البراند."
                : "Brand color is automatically derived from storefront accent color in brand settings."}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{isAr ? "نبذة (عربي)" : "About (Arabic)"}</Label>
              <Textarea
                rows={3}
                value={form.about_ar}
                onChange={(e) => setForm({ ...form, about_ar: e.target.value })}
              />
            </div>
            <div>
              <Label>{isAr ? "نبذة (إنجليزي)" : "About (English)"}</Label>
              <Textarea
                rows={3}
                value={form.about_en}
                onChange={(e) => setForm({ ...form, about_en: e.target.value })}
              />
            </div>
          </div>
          <Card className="space-y-4 p-4 border border-border-subtle shadow rounded-xl bg-card">
            <div>
              <div className="flex items-center justify-between gap-3">
                <Label>{isAr ? "عنوان محركات البحث" : "Meta Title"}</Label>
                <span className="text-xs text-muted-foreground">
                  {form.meta_title.length}/{META_TITLE_LIMIT}
                </span>
              </div>
              <Input
                value={form.meta_title}
                maxLength={META_TITLE_LIMIT}
                onChange={(event) => setForm({ ...form, meta_title: event.target.value })}
                placeholder={
                  isAr ? "عنوان المتجر في نتائج البحث" : "Store title shown in search results"
                }
                dir={isAr ? "rtl" : "ltr"}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-3">
                <Label>{isAr ? "وصف محركات البحث" : "Meta Description"}</Label>
                <span className="text-xs text-muted-foreground">
                  {form.meta_description.length}/{META_DESCRIPTION_LIMIT}
                </span>
              </div>
              <Textarea
                rows={3}
                value={form.meta_description}
                maxLength={META_DESCRIPTION_LIMIT}
                onChange={(event) => setForm({ ...form, meta_description: event.target.value })}
                placeholder={
                  isAr ? "وصف مختصر وجذاب للمتجر" : "A concise description of this storefront"
                }
                dir={isAr ? "rtl" : "ltr"}
              />
            </div>
          </Card>
          <div className="flex items-center justify-between border border-border-subtle rounded-xl p-3 bg-muted/20">
            <div>
              <p className="text-sm font-medium">{isAr ? "نشط" : "Active"}</p>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "إذا كانت غير نشطة، لن تظهر في المتجر."
                  : "Inactive brands are hidden from the storefront."}
              </p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
          </div>
        </div>
      </AppDialogBody>
      <AppDialogFooter>
        <Button
          onClick={save}
          disabled={saving}
          className="shadow-sm transition-all duration-200 hover:scale-[1.01] active:scale-95"
        >
          {t("common.save")}
        </Button>
      </AppDialogFooter>
    </AppDialog>
  );
}
