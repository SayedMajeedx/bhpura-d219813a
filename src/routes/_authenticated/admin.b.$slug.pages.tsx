import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Upload, Trash2, MessageCircle, Plus, GripVertical } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/pages")({
  component: PagesAndPolicies,
});

type PageSlot = {
  title_ar: string;
  title_en: string;
  content_ar: string;
  content_en: string;
  image_url: string | null;
};

type Social = { name: string; url: string };

const emptyPage = (): PageSlot => ({
  title_ar: "",
  title_en: "",
  content_ar: "",
  content_en: "",
  image_url: null,
});

const LONG_TTL = 60 * 60 * 24 * 365 * 10;

async function uploadPageImage(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${userId}/page-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("invoice-assets").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data, error: se } = await supabase.storage.from("invoice-assets").createSignedUrl(path, LONG_TTL);
  if (se || !data) throw se ?? new Error("Failed to sign URL");
  return data.signedUrl;
}

function PagesAndPolicies() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const brandId = brand.id;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["business-settings-pages", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("pages, whatsapp_enabled, whatsapp_number, socials")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [pages, setPages] = useState<PageSlot[]>([]);
  const [socials, setSocials] = useState<Social[]>([]);
  const [waEnabled, setWaEnabled] = useState(false);
  const [waNumber, setWaNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const fileInputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!data) return;
    const rawPages = Array.isArray(data.pages) ? data.pages : [];
    setPages(
      rawPages.map((p: any) => ({
        title_ar: p?.title_ar ?? "",
        title_en: p?.title_en ?? "",
        content_ar: p?.content_ar ?? "",
        content_en: p?.content_en ?? "",
        image_url: p?.image_url ?? null,
      })),
    );
    const rawSocials = Array.isArray(data.socials) ? data.socials : [];
    setSocials(
      rawSocials.map((x: any) => ({
        name: String(x?.name ?? ""),
        url: String(x?.url ?? ""),
      })),
    );
    setWaEnabled(Boolean(data.whatsapp_enabled));
    setWaNumber(data.whatsapp_number ?? "");
  }, [data]);

  const updatePage = (idx: number, patch: Partial<PageSlot>) => {
    setPages((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };
  const removePage = (idx: number) => {
    setPages((prev) => prev.filter((_, i) => i !== idx));
  };
  const addPage = () => setPages((prev) => [...prev, emptyPage()]);

  const updateSocial = (idx: number, patch: Partial<Social>) => {
    setSocials((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeSocial = (idx: number) => setSocials((prev) => prev.filter((_, i) => i !== idx));
  const addSocial = () => setSocials((prev) => [...prev, { name: "", url: "" }]);

  const onPickImage = async (idx: number, file: File) => {
    try {
      setUploadingIdx(idx);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const url = await uploadPageImage(user.id, file);
      updatePage(idx, { image_url: url });
      toast.success(isAr ? "تم الرفع — لا تنس الحفظ" : "Uploaded — remember to save");
    } catch (e: any) {
      toast.error(e.message ?? (isAr ? "فشل الرفع" : "Upload failed"));
    } finally {
      setUploadingIdx(null);
    }
  };

  const save = async () => {
    setSaving(true);
    const cleanedPages = pages.map((p) => ({
      title_ar: p.title_ar.trim() || null,
      title_en: p.title_en.trim() || null,
      content_ar: p.content_ar.trim() || null,
      content_en: p.content_en.trim() || null,
      image_url: p.image_url || null,
    }));
    const cleanedSocials = socials
      .map((s) => ({ name: s.name.trim(), url: s.url.trim() }))
      .filter((s) => s.name && s.url);
    const number = waNumber.replace(/\s+/g, "").replace(/^00/, "+");
    const { error } = await (supabase.from("business_settings") as any)
      .update({
        pages: cleanedPages,
        socials: cleanedSocials,
        whatsapp_enabled: waEnabled,
        whatsapp_number: number || null,
      })
      .eq("brand_id", brandId);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(isAr ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["business-settings-pages", brandId] });
    }
  };

  if (isLoading) return <div className="p-8">Loading…</div>;

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl">
          {isAr ? "الصفحات والسياسات" : "Pages & Policies"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAr
            ? "أضف عدداً غير محدود من الصفحات (من نحن، سياسة التوصيل، دليل المقاسات …) — ستظهر روابطها تلقائياً في تذييل المتجر."
            : "Add unlimited pages (about us, delivery policy, size guide…). Links appear automatically in your storefront footer."}
        </p>
      </div>

      {/* Social links */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg">
            {isAr ? "روابط التواصل الاجتماعي" : "Social media links"}
          </h2>
          <Button type="button" size="sm" variant="outline" onClick={addSocial}>
            <Plus className="h-4 w-4 mr-1" />
            {isAr ? "إضافة رابط منصة" : "Add social link"}
          </Button>
        </div>
        {socials.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isAr ? "لم تُضف أي روابط بعد." : "No links yet."}
          </p>
        )}
        <div className="space-y-3">
          {socials.map((s, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-center">
              <Input
                value={s.name}
                onChange={(e) => updateSocial(i, { name: e.target.value })}
                placeholder={isAr ? "اسم المنصة (INSTAGRAM)" : "Platform (INSTAGRAM)"}
              />
              <Input
                value={s.url}
                onChange={(e) => updateSocial(i, { url: e.target.value })}
                placeholder="https://instagram.com/yourbrand"
                dir="ltr"
                inputMode="url"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeSocial(i)} aria-label="Remove">
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* WhatsApp */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" style={{ color: "#25D366" }} />
          <h2 className="font-display text-lg">
            {isAr ? "زر واتساب العائم" : "WhatsApp floating button"}
          </h2>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <p className="text-sm font-medium">
              {isAr ? "تفعيل الأيقونة على المتجر" : "Enable icon on storefront"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isAr ? "أيقونة عائمة في زاوية المتجر تفتح محادثة واتساب مباشرة" : "Floating corner icon that opens a WhatsApp chat"}
            </p>
          </div>
          <Switch checked={waEnabled} onCheckedChange={setWaEnabled} />
        </div>
        <div>
          <Label>{isAr ? "رقم واتساب مع رمز الدولة" : "WhatsApp number with country code"}</Label>
          <Input
            value={waNumber}
            onChange={(e) => setWaNumber(e.target.value)}
            placeholder="+97312345678"
            inputMode="tel"
            dir="ltr"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {isAr ? "مثال: 97312345678+ (بدون أصفار في البداية)" : "Example: +97312345678 (no leading zeros)"}
          </p>
        </div>
      </Card>

      {/* Pages */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">
          {isAr ? "الصفحات" : "Pages"}
        </h2>
        <Button type="button" onClick={addPage} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          {isAr ? "إضافة صفحة جديدة" : "Add new page"}
        </Button>
      </div>

      {pages.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {isAr ? "لا توجد صفحات بعد. اضغط \"إضافة صفحة جديدة\" للبدء." : 'No pages yet. Click "Add new page" to begin.'}
        </Card>
      )}

      {pages.map((p, i) => (
        <Card key={i} className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display text-lg">
                {isAr ? `الصفحة ${i + 1}` : `Page ${i + 1}`}
              </h2>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => removePage(i)}>
              <Trash2 className="h-4 w-4 mr-1 text-red-600" />
              {isAr ? "حذف" : "Delete"}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{isAr ? "العنوان بالعربي" : "Title (Arabic)"}</Label>
              <Input
                value={p.title_ar}
                onChange={(e) => updatePage(i, { title_ar: e.target.value })}
                placeholder={isAr ? "مثال: دليل المقاسات" : "e.g. دليل المقاسات"}
                dir="rtl"
              />
            </div>
            <div>
              <Label>{isAr ? "العنوان بالإنجليزي" : "Title (English)"}</Label>
              <Input
                value={p.title_en}
                onChange={(e) => updatePage(i, { title_en: e.target.value })}
                placeholder="e.g. Size Guide"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{isAr ? "المحتوى بالعربي" : "Content (Arabic)"}</Label>
              <Textarea
                value={p.content_ar}
                onChange={(e) => updatePage(i, { content_ar: e.target.value })}
                rows={6}
                dir="rtl"
              />
            </div>
            <div>
              <Label>{isAr ? "المحتوى بالإنجليزي" : "Content (English)"}</Label>
              <Textarea
                value={p.content_en}
                onChange={(e) => updatePage(i, { content_en: e.target.value })}
                rows={6}
              />
            </div>
          </div>

          <div>
            <Label>{isAr ? "صورة اختيارية" : "Optional image"}</Label>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                ref={(el) => { fileInputs.current[i] = el; }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(i, f); e.target.value = ""; }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputs.current[i]?.click()}
                disabled={uploadingIdx === i}
              >
                <Upload className="h-4 w-4 mr-1" />
                {uploadingIdx === i
                  ? (isAr ? "جاري الرفع…" : "Uploading…")
                  : (isAr ? "رفع صورة" : "Upload image")}
              </Button>
              {p.image_url && (
                <>
                  <img src={p.image_url} alt="" className="h-16 w-16 object-cover rounded border" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => updatePage(i, { image_url: null })}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    {isAr ? "إزالة" : "Remove"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>
      ))}

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? (isAr ? "جاري الحفظ…" : "Saving…") : (isAr ? "حفظ التغييرات" : "Save changes")}
        </Button>
      </div>
    </div>
  );
}
