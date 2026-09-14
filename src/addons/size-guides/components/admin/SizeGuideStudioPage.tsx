import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Ruler,
  Plus,
  Copy,
  Trash2,
  Check,
  Star,
  Table as TableIcon,
  HelpCircle,
  Eye,
  Settings,
  Upload,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  AlertTriangle,
  FolderTree,
  Sparkles,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { CropUploadButton } from "@/components/crop-upload-button";
import {
  type SizeGuide,
  type SizeGuideColumn,
  type SizeGuideRow,
  type SizeGuideStep,
  type SizeGuideUnit,
  normalizeSizeGuide,
  parseSizeGuidePaste,
} from "../../lib/size-guide";
import { ALL_SIZE_GUIDE_TEMPLATES, ABAYA_GULF_TEMPLATE } from "../../lib/size-guide-templates";
import { SizeGuidePanel } from "../storefront/size-guide/SizeGuidePanel";

type FormState = {
  id?: string;
  name_ar: string;
  name_en: string;
  template_key: string | null;
  base_unit: SizeGuideUnit;
  columns: SizeGuideColumn[];
  rows: SizeGuideRow[];
  how_to_measure: SizeGuideStep[];
  diagram_url: string | null;
  video_url: string | null;
  recommender_enabled: boolean;
  placement: "modal" | "inline" | "both";
  notes_ar: string;
  notes_en: string;
  is_default: boolean;
  is_active: boolean;
  assignedCategoryIds: string[];
};

function emptyForm(): FormState {
  return {
    name_ar: "دليل مقاسات جديد",
    name_en: "New Size Guide",
    template_key: null,
    base_unit: "in",
    columns: [
      { key: "size", label_ar: "المقاس", label_en: "Size", kind: "size_label" },
      {
        key: "length",
        label_ar: "الطول",
        label_en: "Length",
        kind: "measurement",
        measurement_key: "length",
      },
      {
        key: "bust",
        label_ar: "الصدر",
        label_en: "Bust",
        kind: "measurement",
        measurement_key: "bust",
      },
    ],
    rows: [
      { label: "52", size_label: "52", values: { length: 52, bust: 20 } },
      { label: "54", size_label: "54", values: { length: 54, bust: 21 } },
      { label: "56", size_label: "56", values: { length: 56, bust: 22 } },
    ],
    how_to_measure: [],
    diagram_url: null,
    video_url: null,
    recommender_enabled: true,
    placement: "both",
    notes_ar: "",
    notes_en: "",
    is_default: false,
    is_active: true,
    assignedCategoryIds: [],
  };
}

export function SizeGuidesStudioPage() {
  const brand = useBrand();
  const brandId = brand.id;
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [uploadingDiagram, setUploadingDiagram] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("table");

  // Fetch size guides
  const { data: guides = [], isLoading } = useQuery<SizeGuide[]>({
    queryKey: ["admin", brandId, "size_guides"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("size_guides")
        .select("*")
        .eq("brand_id", brandId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(normalizeSizeGuide);
    },
  });

  // Fetch usage counts
  const { data: usage = { products: {}, categories: {} } } = useQuery({
    queryKey: ["admin", brandId, "size_guides_usage"],
    queryFn: async () => {
      const [prodRes, catRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, size_guide_id")
          .eq("brand_id", brandId)
          .not("size_guide_id", "is", null),
        supabase
          .from("categories")
          .select("id, size_guide_id")
          .eq("brand_id", brandId)
          .not("size_guide_id", "is", null),
      ]);
      const products: Record<string, number> = {};
      const categories: Record<string, number> = {};
      (prodRes.data ?? []).forEach((p: any) => {
        if (p.size_guide_id) products[p.size_guide_id] = (products[p.size_guide_id] || 0) + 1;
      });
      (catRes.data ?? []).forEach((c: any) => {
        if (c.size_guide_id) categories[c.size_guide_id] = (categories[c.size_guide_id] || 0) + 1;
      });
      return { products, categories };
    },
  });

  // Fetch brand categories for bulk linking
  const { data: allCategories = [] } = useQuery<
    Array<{ id: string; name_ar: string; name_en: string; size_guide_id: string | null }>
  >({
    queryKey: ["admin", brandId, "categories_for_guides"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("categories")
        .select("id, name_ar, name_en, size_guide_id")
        .eq("brand_id", brandId);
      if (error) throw error;
      return (
        (data as Array<{
          id: string;
          name_ar: string;
          name_en: string;
          size_guide_id: string | null;
        }>) ?? []
      );
    },
  });

  // Sync selected guide with form
  useEffect(() => {
    if (guides.length > 0) {
      const found = selectedId ? guides.find((g) => g.id === selectedId) : null;
      const target = found || guides.find((g) => g.is_default) || guides[0];
      if (target && (!selectedId || target.id !== selectedId || !form.id)) {
        setSelectedId(target.id);
        const assigned = allCategories
          .filter((c) => c.size_guide_id === target.id)
          .map((c) => c.id);
        setForm({
          id: target.id,
          name_ar: target.name_ar,
          name_en: target.name_en,
          template_key: target.template_key,
          base_unit: target.base_unit,
          columns: target.columns,
          rows: target.rows,
          how_to_measure: target.how_to_measure,
          diagram_url: target.diagram_url,
          video_url: target.video_url,
          recommender_enabled: target.recommender_enabled,
          placement: target.placement,
          notes_ar: target.notes_ar || "",
          notes_en: target.notes_en || "",
          is_default: target.is_default,
          is_active: target.is_active,
          assignedCategoryIds: assigned,
        });
      }
    } else if (!selectedId && !isLoading) {
      // No guides at all -> offer creating from default abaya template
      setForm(emptyForm());
    }
  }, [guides, selectedId, isLoading, allCategories]);

  const selectGuide = (guide: SizeGuide) => {
    setSelectedId(guide.id);
    const assigned = allCategories.filter((c) => c.size_guide_id === guide.id).map((c) => c.id);
    setForm({
      id: guide.id,
      name_ar: guide.name_ar,
      name_en: guide.name_en,
      template_key: guide.template_key,
      base_unit: guide.base_unit,
      columns: guide.columns,
      rows: guide.rows,
      how_to_measure: guide.how_to_measure,
      diagram_url: guide.diagram_url,
      video_url: guide.video_url,
      recommender_enabled: guide.recommender_enabled,
      placement: guide.placement,
      notes_ar: guide.notes_ar || "",
      notes_en: guide.notes_en || "",
      is_default: guide.is_default,
      is_active: guide.is_active,
      assignedCategoryIds: assigned,
    });
  };

  const createFromTemplate = (template: typeof ABAYA_GULF_TEMPLATE) => {
    const isFirst = guides.length === 0;
    const newForm: FormState = {
      name_ar: template.name_ar,
      name_en: template.name_en,
      template_key: template.key,
      base_unit: template.base_unit,
      columns: JSON.parse(JSON.stringify(template.columns)),
      rows: JSON.parse(JSON.stringify(template.rows)),
      how_to_measure: JSON.parse(JSON.stringify(template.how_to_measure)),
      diagram_url: null,
      video_url: null,
      recommender_enabled: true,
      placement: "both",
      notes_ar: template.notes_ar || "",
      notes_en: template.notes_en || "",
      is_default: isFirst,
      is_active: true,
      assignedCategoryIds: [],
    };
    setSelectedId(null);
    setForm(newForm);
    setTemplateDialogOpen(false);
  };

  const handleDuplicate = () => {
    const newForm: FormState = {
      ...form,
      id: undefined,
      name_ar: `${form.name_ar} (نسخة)`,
      name_en: `${form.name_en} (Copy)`,
      is_default: false,
      assignedCategoryIds: [],
    };
    setSelectedId(null);
    setForm(newForm);
    toast.success(isAr ? "تم إنشاء نسخة من الدليل" : "Guide duplicated");
  };

  const handleApplyPaste = () => {
    if (!pasteText.trim()) return;
    const parsed = parseSizeGuidePaste(pasteText, form.base_unit);
    if (!parsed) {
      toast.error(
        isAr
          ? "تعذر قراءة البيانات. تأكد من نسخ جدول يحتوي على رؤوس أعمدة."
          : "Could not parse table data. Make sure it includes headers.",
      );
      return;
    }
    setForm((prev) => ({
      ...prev,
      columns: parsed.columns,
      rows: parsed.rows,
    }));
    setPasteDialogOpen(false);
    setPasteText("");
    toast.success(
      isAr
        ? `تم استيراد ${parsed.rows.length} مقاس بنجاح`
        : `Imported ${parsed.rows.length} rows successfully`,
    );
  };

  const handleDiagramUpload = async (blob: Blob) => {
    setUploadingDiagram(true);
    try {
      const file = new File([blob], "size-guide-diagram.webp", { type: "image/webp" });
      const url = await uploadPublicMedia(brandId, file, "product");
      setForm((prev) => ({ ...prev, diagram_url: url }));
      toast.success(isAr ? "تم رفع الصورة التوضيحية" : "Diagram uploaded");
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل الرفع" : "Upload failed"));
    } finally {
      setUploadingDiagram(false);
    }
  };

  const handleSave = async () => {
    if (!form.name_ar.trim() || !form.name_en.trim()) {
      toast.error(
        isAr
          ? "يرجى كتابة اسم الدليل بالعربية والإنجليزية"
          : "Please provide names in Arabic and English",
      );
      return;
    }
    if (form.columns.length === 0) {
      toast.error(isAr ? "يجب إضافة عمود واحد على الأقل" : "At least one column is required");
      return;
    }
    if (form.rows.length === 0) {
      toast.error(isAr ? "يجب إضافة مقاس واحد على الأقل" : "At least one size row is required");
      return;
    }

    setSaving(true);
    try {
      // If setting default, clear other default guides for this brand
      if (form.is_default) {
        await (supabase as any)
          .from("size_guides")
          .update({ is_default: false })
          .eq("brand_id", brandId);
      }

      const payload = {
        brand_id: brandId,
        name_ar: form.name_ar.trim(),
        name_en: form.name_en.trim(),
        template_key: form.template_key,
        base_unit: form.base_unit,
        columns: form.columns,
        rows: form.rows,
        how_to_measure: form.how_to_measure,
        diagram_url: form.diagram_url,
        video_url: form.video_url,
        recommender_enabled: form.recommender_enabled,
        placement: form.placement,
        notes_ar: form.notes_ar.trim() || null,
        notes_en: form.notes_en.trim() || null,
        is_default: form.is_default,
        is_active: form.is_active,
      };

      let savedId = form.id;
      if (form.id) {
        const { error } = await (supabase as any)
          .from("size_guides")
          .update(payload)
          .eq("id", form.id)
          .eq("brand_id", brandId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("size_guides")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        savedId = data?.id;
      }

      // Sync category assignments
      if (savedId) {
        // Clear old categories pointing to this guide that were unchecked
        const removedCats = allCategories
          .filter((c) => c.size_guide_id === savedId && !form.assignedCategoryIds.includes(c.id))
          .map((c) => c.id);
        if (removedCats.length > 0) {
          await (supabase as any)
            .from("categories")
            .update({ size_guide_id: null })
            .in("id", removedCats);
        }

        // Add newly assigned categories
        const addedCats = form.assignedCategoryIds.filter((cid) => {
          const current = allCategories.find((c) => c.id === cid);
          return current?.size_guide_id !== savedId;
        });
        if (addedCats.length > 0) {
          await (supabase as any)
            .from("categories")
            .update({ size_guide_id: savedId })
            .in("id", addedCats);
        }
      }

      await qc.invalidateQueries({ queryKey: ["admin", brandId] });
      await qc.invalidateQueries({ queryKey: ["storefront", brand.slug] });

      if (savedId) {
        setSelectedId(savedId);
      }
      toast.success(isAr ? "تم حفظ دليل المقاسات بنجاح" : "Size guide saved successfully");
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل الحفظ" : "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!form.id) return;
    try {
      // Unlink products and categories
      await Promise.all([
        (supabase as any)
          .from("products")
          .update({ size_guide_id: null })
          .eq("brand_id", brandId)
          .eq("size_guide_id", form.id),
        (supabase as any)
          .from("categories")
          .update({ size_guide_id: null })
          .eq("brand_id", brandId)
          .eq("size_guide_id", form.id),
      ]);

      const { error } = await (supabase as any)
        .from("size_guides")
        .delete()
        .eq("id", form.id)
        .eq("brand_id", brandId);
      if (error) throw error;

      await qc.invalidateQueries({ queryKey: ["admin", brandId] });
      setSelectedId(null);
      setDeleteConfirmOpen(false);
      toast.success(isAr ? "تم حذف دليل المقاسات" : "Size guide deleted");
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل الحذف" : "Failed to delete"));
    }
  };

  // Convert current form to SizeGuide for preview
  const previewGuide: SizeGuide = useMemo(() => {
    return {
      id: form.id || "preview-id",
      brand_id: brandId,
      name_ar: form.name_ar,
      name_en: form.name_en,
      template_key: form.template_key,
      base_unit: form.base_unit,
      columns: form.columns,
      rows: form.rows,
      how_to_measure: form.how_to_measure,
      diagram_url: form.diagram_url,
      video_url: form.video_url,
      recommender_enabled: form.recommender_enabled,
      placement: form.placement,
      notes_ar: form.notes_ar || null,
      notes_en: form.notes_en || null,
      is_default: form.is_default,
      is_active: form.is_active,
      sort_order: 0,
      created_at: "",
      updated_at: "",
    };
  }, [form, brandId]);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Ruler className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {isAr ? "استوديو أدلة المقاسات" : "Size Guide Studio"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "إدارة جداول المقاسات، طرق القياس، ومقترح المقاسات الذكي"
                  : "Manage size charts, measuring instructions, and the smart recommender"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTemplateDialogOpen(true)}
            className="gap-1.5 h-9"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? "دليل جديد من قالب" : "New from template"}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedId(null);
              setForm(emptyForm());
            }}
            className="gap-1.5 h-9"
          >
            <Plus className="h-4 w-4" />
            <span>{isAr ? "دليل فارغ" : "Blank guide"}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5 h-9 min-w-24"
          >
            <Check className="h-4 w-4" />
            <span>
              {saving ? (isAr ? "جارٍ الحفظ…" : "Saving…") : isAr ? "حفظ التغييرات" : "Save Guide"}
            </span>
          </Button>
        </div>
      </div>

      {/* Main Studio Two-Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Guides List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? "الأدلة المحفوظة" : "Saved Guides"} ({guides.length})
            </span>
          </div>

          <div className="space-y-2">
            {guides.length === 0 && !isLoading && (
              <div className="rounded-xl border border-dashed border-border p-6 text-center bg-card">
                <Ruler className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium text-foreground">
                  {isAr ? "لا توجد أدلة مقاسات بعد" : "No size guides yet"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  {isAr
                    ? "اختر قالبًا جاهزًا للبدء فورًا"
                    : "Pick a vertical template to get started instantly"}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setTemplateDialogOpen(true)}
                  className="gap-1 text-xs"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>{isAr ? "تصفح القوالب" : "Browse templates"}</span>
                </Button>
              </div>
            )}

            {guides.map((guide) => {
              const isSelected = guide.id === form.id;
              const prodCount = usage.products[guide.id] || 0;
              const catCount = usage.categories[guide.id] || 0;

              return (
                <div
                  key={guide.id}
                  onClick={() => selectGuide(guide)}
                  className={`group relative rounded-xl border p-3.5 cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                      : "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-foreground truncate">
                          {isAr ? guide.name_ar : guide.name_en}
                        </span>
                        {guide.is_default && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs font-semibold">
                            <Star className="h-3 w-3 fill-current" />
                            {isAr ? "افتراضي" : "Default"}
                          </span>
                        )}
                        {!guide.is_active && (
                          <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
                            {isAr ? "معطل" : "Inactive"}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {isAr ? guide.name_en : guide.name_ar} • {guide.base_unit.toUpperCase()}
                      </p>
                    </div>

                    <div className="text-end text-xs text-muted-foreground shrink-0">
                      <div>
                        {prodCount} {isAr ? "منتج" : "products"}
                      </div>
                      <div>
                        {catCount} {isAr ? "قسم" : "categories"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: 4-Tab Editor & Live Preview */}
        <div className="lg:col-span-8 rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4 mb-5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                {form.id
                  ? isAr
                    ? "تعديل الدليل:"
                    : "Editing Guide:"
                  : isAr
                    ? "دليل جديد"
                    : "New Guide"}
              </span>
              <span className="text-sm text-primary font-semibold">
                {isAr ? form.name_ar : form.name_en}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {form.id && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDuplicate}
                    className="gap-1.5 h-8 text-xs"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{isAr ? "نسخ" : "Duplicate"}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{isAr ? "حذف" : "Delete"}</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
            <TabsList className="grid grid-cols-4 w-full h-10">
              <TabsTrigger value="table" className="gap-1.5 text-xs">
                <TableIcon className="h-3.5 w-3.5" />
                <span>{isAr ? "جدول القياسات" : "Size Table"}</span>
              </TabsTrigger>
              <TabsTrigger value="measure" className="gap-1.5 text-xs">
                <HelpCircle className="h-3.5 w-3.5" />
                <span>{isAr ? "طريقة القياس" : "How to Measure"}</span>
              </TabsTrigger>
              <TabsTrigger value="placement" className="gap-1.5 text-xs">
                <Settings className="h-3.5 w-3.5" />
                <span>{isAr ? "العرض والربط" : "Settings & Linking"}</span>
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-1.5 text-xs">
                <Eye className="h-3.5 w-3.5" />
                <span>{isAr ? "معاينة حية" : "Live Preview"}</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: TABLE EDITOR */}
            <TabsContent value="table" className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    {isAr ? "الاسم بالعربية" : "Name (Arabic)"}
                  </Label>
                  <Input
                    value={form.name_ar}
                    onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                    placeholder="مثال: دليل مقاسات العبايات"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    {isAr ? "الاسم بالإنجليزية" : "Name (English)"}
                  </Label>
                  <Input
                    value={form.name_en}
                    onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                    placeholder="e.g. Abaya Size Guide"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    {isAr ? "وحدة القياس الأساسية" : "Base Unit"}
                  </Label>
                  <div className="flex items-center rounded-lg border border-border p-0.5 bg-muted/40 h-9">
                    <Button
                      type="button"
                      size="sm"
                      variant={form.base_unit === "in" ? "default" : "ghost"}
                      onClick={() => setForm({ ...form, base_unit: "in" })}
                      className="flex-1 h-7 text-xs rounded-md"
                    >
                      {isAr ? "إنش (in)" : "Inches (in)"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={form.base_unit === "cm" ? "default" : "ghost"}
                      onClick={() => setForm({ ...form, base_unit: "cm" })}
                      className="flex-1 h-7 text-xs rounded-md"
                    >
                      {isAr ? "سم (cm)" : "Centimeters (cm)"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Columns Editor */}
              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {isAr ? "أعمدة الجدول" : "Table Columns"} ({form.columns.length})
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPasteDialogOpen(true)}
                      className="gap-1.5 h-8 text-xs"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                      <span>{isAr ? "لصق من Excel / Sheets" : "Paste from Sheets"}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newKey = `col_${Date.now()}`;
                        setForm((prev) => ({
                          ...prev,
                          columns: [
                            ...prev.columns,
                            {
                              key: newKey,
                              label_ar: "عمود جديد",
                              label_en: "New Column",
                              kind: "measurement",
                            },
                          ],
                        }));
                      }}
                      className="gap-1 h-8 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{isAr ? "إضافة عمود" : "Add column"}</span>
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {form.columns.map((col, idx) => {
                    const _isFirst = idx === 0;
                    return (
                      <div
                        key={col.key || idx}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 bg-muted/20 text-xs"
                      >
                        <span className="w-5 text-muted-foreground font-mono text-xs">
                          #{idx + 1}
                        </span>

                        <div className="flex-1 min-w-32">
                          <Input
                            value={col.label_ar}
                            onChange={(e) => {
                              const next = [...form.columns];
                              next[idx].label_ar = e.target.value;
                              setForm({ ...form, columns: next });
                            }}
                            placeholder={isAr ? "العنوان بالعربية" : "Label AR"}
                            className="h-8 text-xs"
                          />
                        </div>

                        <div className="flex-1 min-w-32">
                          <Input
                            value={col.label_en}
                            onChange={(e) => {
                              const next = [...form.columns];
                              next[idx].label_en = e.target.value;
                              setForm({ ...form, columns: next });
                            }}
                            placeholder={isAr ? "العنوان بالإنجليزية" : "Label EN"}
                            className="h-8 text-xs"
                          />
                        </div>

                        <div className="w-32">
                          <select
                            value={col.kind}
                            onChange={(e) => {
                              const next = [...form.columns];
                              next[idx].kind = e.target.value as any;
                              setForm({ ...form, columns: next });
                            }}
                            className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value="size_label">
                              {isAr ? "تسمية المقاس" : "Size Label"}
                            </option>
                            <option value="dimension">{isAr ? "قياس رئيسي" : "Dimension"}</option>
                            <option value="secondary_dimension">
                              {isAr ? "قياس ثانوي" : "Secondary"}
                            </option>
                          </select>
                        </div>

                        {col.kind !== "size_label" && (
                          <div className="w-32">
                            <select
                              value={col.measurement_key || ""}
                              onChange={(e) => {
                                const next = [...form.columns];
                                next[idx].measurement_key = (e.target.value || undefined) as any;
                                setForm({ ...form, columns: next });
                              }}
                              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                            >
                              <option value="">{isAr ? "مطابقة القياس..." : "Match key..."}</option>
                              <option value="length">{isAr ? "الطول" : "Length"}</option>
                              <option value="bust">{isAr ? "الصدر" : "Bust"}</option>
                              <option value="chest">{isAr ? "الصدر (رجالي)" : "Chest"}</option>
                              <option value="waist">{isAr ? "الخصر" : "Waist"}</option>
                              <option value="hips">{isAr ? "الورك" : "Hips"}</option>
                              <option value="shoulder">{isAr ? "الكتف" : "Shoulder"}</option>
                              <option value="sleeve">{isAr ? "الكم" : "Sleeve"}</option>
                              <option value="weight">{isAr ? "الوزن" : "Weight"}</option>
                              <option value="height">{isAr ? "طول القامة" : "Height"}</option>
                            </select>
                          </div>
                        )}

                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={idx === 0}
                            onClick={() => {
                              const next = [...form.columns];
                              const temp = next[idx - 1];
                              next[idx - 1] = next[idx];
                              next[idx] = temp;
                              setForm({ ...form, columns: next });
                            }}
                            className="h-7 w-7"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={idx === form.columns.length - 1}
                            onClick={() => {
                              const next = [...form.columns];
                              const temp = next[idx + 1];
                              next[idx + 1] = next[idx];
                              next[idx] = temp;
                              setForm({ ...form, columns: next });
                            }}
                            className="h-7 w-7"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={form.columns.length <= 1}
                            onClick={() => {
                              const next = form.columns.filter((_, i) => i !== idx);
                              setForm({ ...form, columns: next });
                            }}
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rows Editor */}
              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {isAr ? "الصفوف والمقاسات" : "Size Rows"} ({form.rows.length})
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        rows: [
                          ...prev.rows,
                          {
                            label: "M",
                            size_label: "M",
                            values: {},
                          },
                        ],
                      }));
                    }}
                    className="gap-1 h-8 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{isAr ? "إضافة مقاس" : "Add size row"}</span>
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border bg-background">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                        <th className="py-2 px-3 text-start font-semibold">
                          {isAr ? "المقاس" : "Size"}
                        </th>
                        {form.columns
                          .filter((c) => c.kind !== "size_label")
                          .map((col) => (
                            <th key={col.key} className="py-2 px-3 text-center font-semibold">
                              {isAr ? col.label_ar : col.label_en} ({form.base_unit})
                            </th>
                          ))}
                        <th className="py-2 px-3 text-center font-semibold w-24">
                          {isAr ? "إجراءات" : "Actions"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {form.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-muted/10">
                          <td className="py-2 px-3 font-semibold">
                            <Input
                              value={row.size_label}
                              onChange={(e) => {
                                const next = [...form.rows];
                                next[rIdx].size_label = e.target.value;
                                setForm({ ...form, rows: next });
                              }}
                              className="h-8 w-20 text-xs font-bold text-center"
                            />
                          </td>

                          {form.columns
                            .filter((c) => c.kind !== "size_label")
                            .map((col) => {
                              const rawVal = row.values[col.key];
                              const displayVal =
                                typeof rawVal === "object" && rawVal !== null
                                  ? `${(rawVal as any).min}-${(rawVal as any).max}`
                                  : (rawVal ?? "");
                              return (
                                <td key={col.key} className="py-2 px-2 text-center">
                                  <Input
                                    value={displayVal}
                                    onChange={(e) => {
                                      const next = [...form.rows];
                                      const valStr = e.target.value.trim();
                                      if (valStr.includes("-")) {
                                        const [min, max] = valStr
                                          .split("-")
                                          .map((s) => Number(s.trim()));
                                        next[rIdx].values[col.key] = {
                                          min: min || 0,
                                          max: max || 0,
                                        };
                                      } else if (!isNaN(Number(valStr)) && valStr !== "") {
                                        next[rIdx].values[col.key] = Number(valStr);
                                      } else {
                                        next[rIdx].values[col.key] = valStr;
                                      }
                                      setForm({ ...form, rows: next });
                                    }}
                                    placeholder="0"
                                    className="h-8 w-24 text-xs text-center mx-auto"
                                  />
                                </td>
                              );
                            })}

                          <td className="py-2 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const copy = JSON.parse(JSON.stringify(row));
                                  copy.size_label = `${row.size_label}+`;
                                  const next = [...form.rows];
                                  next.splice(rIdx + 1, 0, copy);
                                  setForm({ ...form, rows: next });
                                }}
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                title={isAr ? "نسخ الصف" : "Duplicate row"}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={form.rows.length <= 1}
                                onClick={() => {
                                  const next = form.rows.filter((_, i) => i !== rIdx);
                                  setForm({ ...form, rows: next });
                                }}
                                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                title={isAr ? "حذف الصف" : "Delete row"}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: HOW TO MEASURE */}
            <TabsContent value="measure" className="space-y-6">
              {/* Steps Builder */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {isAr ? "خطوات أخذ القياس" : "Measuring Steps"}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isAr
                        ? "أرشد المشتري لكيفية قياس أبعاده بدقة بالخطوات"
                        : "Guide the customer step-by-step on taking accurate measurements"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        how_to_measure: [
                          ...prev.how_to_measure,
                          {
                            step_number: prev.how_to_measure.length + 1,
                            title_ar: "طريقة قياس الطول",
                            title_en: "How to measure length",
                            body_ar: "قم بالقياس من أعلى نقطة في الكتف حتى الأسفل.",
                            body_en:
                              "Measure from the highest point of the shoulder straight down.",
                            description_ar: "قم بالقياس من أعلى نقطة في الكتف حتى الأسفل.",
                            description_en:
                              "Measure from the highest point of the shoulder straight down.",
                          },
                        ],
                      }));
                    }}
                    className="gap-1 h-8 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{isAr ? "إضافة خطوة" : "Add step"}</span>
                  </Button>
                </div>

                <div className="space-y-3">
                  {form.how_to_measure.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                      {isAr
                        ? "لم تتم إضافة خطوات بعد. يمكنك إضافة خطوات توضيحية لتعليم المشتري."
                        : "No measurement steps added yet."}
                    </div>
                  )}

                  {form.how_to_measure.map((step, sIdx) => (
                    <div
                      key={sIdx}
                      className="rounded-xl border border-border p-3.5 bg-muted/20 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-primary">
                          {isAr ? `الخطوة ${sIdx + 1}` : `Step ${sIdx + 1}`}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const next = form.how_to_measure.filter((_, i) => i !== sIdx);
                            setForm({ ...form, how_to_measure: next });
                          }}
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">
                            {isAr ? "عنوان الخطوة بالعربية" : "Step Title (AR)"}
                          </Label>
                          <Input
                            value={step.title_ar}
                            onChange={(e) => {
                              const next = [...form.how_to_measure];
                              next[sIdx].title_ar = e.target.value;
                              setForm({ ...form, how_to_measure: next });
                            }}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            {isAr ? "عنوان الخطوة بالإنجليزية" : "Step Title (EN)"}
                          </Label>
                          <Input
                            value={step.title_en}
                            onChange={(e) => {
                              const next = [...form.how_to_measure];
                              next[sIdx].title_en = e.target.value;
                              setForm({ ...form, how_to_measure: next });
                            }}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">
                            {isAr ? "الشرح بالعربية" : "Instructions (AR)"}
                          </Label>
                          <Textarea
                            rows={2}
                            value={step.body_ar || step.description_ar || ""}
                            onChange={(e) => {
                              const next = [...form.how_to_measure];
                              next[sIdx].body_ar = e.target.value;
                              next[sIdx].description_ar = e.target.value;
                              setForm({ ...form, how_to_measure: next });
                            }}
                            className="text-xs resize-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            {isAr ? "الشرح بالإنجليزية" : "Instructions (EN)"}
                          </Label>
                          <Textarea
                            rows={2}
                            value={step.body_en || step.description_en || ""}
                            onChange={(e) => {
                              const next = [...form.how_to_measure];
                              next[sIdx].body_en = e.target.value;
                              next[sIdx].description_en = e.target.value;
                              setForm({ ...form, how_to_measure: next });
                            }}
                            className="text-xs resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Diagram Upload */}
              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    {isAr ? "الصورة التوضيحية للقياس (Diagram)" : "Measurement Diagram"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr
                      ? "صورة رسم توضيحي تظهر مواضع أخذ القياسات على الجسم"
                      : "Visual diagram showing where to measure on the body"}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  {form.diagram_url ? (
                    <div className="relative h-28 w-24 rounded-lg overflow-hidden border border-border bg-muted">
                      <img
                        src={form.diagram_url}
                        alt="Diagram"
                        className="h-full w-full object-cover"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => setForm({ ...form, diagram_url: null })}
                        className="absolute top-1 end-1 h-6 w-6 rounded-full"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="h-28 w-24 rounded-lg border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground text-xs p-2 text-center bg-muted/20">
                      <Ruler className="h-6 w-6 mb-1 opacity-50" />
                      <span>{isAr ? "لا توجد صورة" : "No image"}</span>
                    </div>
                  )}

                  <div className="space-y-2 flex-1 max-w-sm">
                    <CropUploadButton
                      onCrop={handleDiagramUpload}
                      preset="sizeGuideDiagram"
                      busy={uploadingDiagram}
                      title={isAr ? "ضبط الصورة التوضيحية" : "Adjust Diagram"}
                      description={
                        isAr
                          ? "حرك وكبّر الصورة لتناسب إطار دليل المقاسات"
                          : "Reposition and crop diagram for the size guide"
                      }
                      className="gap-2 text-xs"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>
                        {isAr ? "رفع صورة توضيحية (800x1000)" : "Upload diagram (800x1000)"}
                      </span>
                    </CropUploadButton>
                  </div>
                </div>
              </div>

              {/* Video URL */}
              <div className="border-t border-border pt-4 space-y-1.5 max-w-md">
                <Label className="text-xs font-semibold">
                  {isAr ? "رابط فيديو توضيحي (اختياري)" : "Video Tutorial URL (Optional)"}
                </Label>
                <Input
                  value={form.video_url || ""}
                  onChange={(e) => setForm({ ...form, video_url: e.target.value || null })}
                  placeholder="https://..."
                  className="h-9 text-xs"
                />
              </div>
            </TabsContent>

            {/* TAB 3: PLACEMENT & LINKING */}
            <TabsContent value="placement" className="space-y-6">
              {/* Placement Options */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-foreground">
                  {isAr ? "موضع ظهور الدليل في صفحة المنتج" : "Storefront Placement"}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: "modal",
                      title_ar: "نافذة منبثقة فقط",
                      title_en: "Modal button only",
                      desc_ar: "زر بجانب المقاسات يفتح نافذة الدليل",
                      desc_en: "A button next to sizes opening a popup modal",
                    },
                    {
                      id: "inline",
                      title_ar: "مضمّن في الصفحة",
                      title_en: "Inline accordion",
                      desc_ar: "قسم قابل للفتح مباشرة أسفل تفاصيل المنتج",
                      desc_en: "Collapsible accordion directly on the PDP",
                    },
                    {
                      id: "both",
                      title_ar: "كلاهما معاً",
                      title_en: "Both modal & inline",
                      desc_ar: "يوفر أعلى مستوى وصول للمشتري",
                      desc_en: "Best accessibility across all devices",
                    },
                  ].map((p) => {
                    const active = form.placement === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => setForm({ ...form, placement: p.id as any })}
                        className={`rounded-xl border p-3.5 cursor-pointer transition-all ${
                          active
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:border-muted-foreground/30 bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-foreground">
                            {isAr ? p.title_ar : p.title_en}
                          </span>
                          {active && <Check className="h-4 w-4 text-primary stroke-[3]" />}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {isAr ? p.desc_ar : p.desc_en}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Toggles */}
              <div className="border-t border-border pt-4 space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-border p-3.5 bg-muted/20">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-foreground flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span>{isAr ? "مُقترح المقاسات الذكي" : "Smart Size Recommender"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "يسمح للمشتري بإدخال مقاساته ويقترح له تلقائياً المقاس الأنسب بدقة"
                        : "Prompts shoppers for their measurements to suggest their perfect size"}
                    </p>
                  </div>
                  <Switch
                    checked={form.recommender_enabled}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, recommender_enabled: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border p-3.5 bg-muted/20">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-foreground flex items-center gap-2">
                      <Star className="h-4 w-4 text-primary" />
                      <span>
                        {isAr ? "جعله الدليل الافتراضي للمتجر" : "Default Guide for Store"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "يُطبق تلقائياً على أي منتج أو قسم لا يحدد دليلاً خاصاً"
                        : "Automatically inherits across all products without a specific guide"}
                    </p>
                  </div>
                  <Switch
                    checked={form.is_default}
                    onCheckedChange={(checked) => setForm({ ...form, is_default: checked })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border p-3.5 bg-muted/20">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-foreground">
                      {isAr ? "تفعيل الدليل" : "Guide Active"}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "إظهار الدليل للمشترين في المتجر"
                        : "Display this guide in storefront"}
                    </p>
                  </div>
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                  />
                </div>
              </div>

              {/* Notes / Disclaimers */}
              <div className="border-t border-border pt-4 space-y-3">
                <h3 className="text-sm font-bold text-foreground">
                  {isAr ? "ملاحظات وتنبيهات أسفل الجدول" : "Table Notes & Disclaimers"}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? "ملاحظات بالعربية" : "Notes (AR)"}</Label>
                    <Textarea
                      rows={2}
                      value={form.notes_ar}
                      onChange={(e) => setForm({ ...form, notes_ar: e.target.value })}
                      placeholder="مثال: جميع القياسات مأخوذة يدويًا وقد تختلف بمقدار 1-2 سم"
                      className="text-xs resize-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? "ملاحظات بالإنجليزية" : "Notes (EN)"}</Label>
                    <Textarea
                      rows={2}
                      value={form.notes_en}
                      onChange={(e) => setForm({ ...form, notes_en: e.target.value })}
                      placeholder="e.g. All measurements are taken by hand and may vary by 1-2 cm"
                      className="text-xs resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Category Linking */}
              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FolderTree className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">
                    {isAr ? "ربط جماعي بالأقسام" : "Bulk Category Linking"}
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? "حدد الأقسام التي ترغب في تطبيق هذا الدليل عليها وعلى جميع منتجاتها تلقائياً:"
                    : "Select categories that should inherit this size guide for all their products:"}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-xl border border-border p-3 bg-muted/10">
                  {allCategories.length === 0 && (
                    <span className="text-xs text-muted-foreground col-span-2">
                      {isAr ? "لا توجد أقسام مسجلة" : "No categories created yet"}
                    </span>
                  )}
                  {allCategories.map((cat) => {
                    const isChecked = form.assignedCategoryIds.includes(cat.id);
                    return (
                      <label
                        key={cat.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isChecked
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border hover:bg-muted/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setForm({
                                ...form,
                                assignedCategoryIds: [...form.assignedCategoryIds, cat.id],
                              });
                            } else {
                              setForm({
                                ...form,
                                assignedCategoryIds: form.assignedCategoryIds.filter(
                                  (id) => id !== cat.id,
                                ),
                              });
                            }
                          }}
                          className="rounded border-input text-primary focus:ring-primary"
                        />
                        <span className="truncate">
                          {isAr ? cat.name_ar || cat.name_en : cat.name_en}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* TAB 4: LIVE PREVIEW */}
            <TabsContent value="preview" className="space-y-4">
              <div className="rounded-xl bg-muted/20 border border-border p-4">
                <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                  <Info className="h-4 w-4 text-primary shrink-0" />
                  <span>
                    {isAr
                      ? "هذه معاينة حية تفاعلية تحاكي شكل الدليل للمشتري في متجرك تماماً."
                      : "This is an interactive live preview simulating exactly how customers see this size guide in your store."}
                  </span>
                </div>

                <div className="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-xs">
                  <SizeGuidePanel guide={previewGuide} />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Template Picker Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span>{isAr ? "اختيار قالب دليل مقاسات جاهز" : "Choose a Size Guide Template"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3">
            {ALL_SIZE_GUIDE_TEMPLATES.map((tmpl) => (
              <div
                key={tmpl.key}
                onClick={() => createFromTemplate(tmpl)}
                className="group rounded-xl border border-border p-3.5 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      {isAr ? tmpl.name_ar : tmpl.name_en}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono uppercase text-muted-foreground">
                      {tmpl.base_unit}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {isAr ? tmpl.vertical_description_ar : tmpl.vertical_description_en}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {tmpl.rows.length} {isAr ? "مقاسات" : "sizes"}
                  </span>
                  <span className="text-primary font-medium group-hover:underline">
                    {isAr ? "استخدام القالب ←" : "Use template →"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Paste from Sheets Dialog */}
      <Dialog open={pasteDialogOpen} onOpenChange={setPasteDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <span>
                {isAr ? "لصق من جدول بيانات (Excel / Google Sheets)" : "Paste from Spreadsheet"}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isAr
                ? "انسخ جدول المقاسات من Excel أو Google Sheets (متضمناً صف العناوين بالأعلى) والصقه هنا مباشرة:"
                : "Copy your size chart including the header row from Excel or Google Sheets and paste it here directly:"}
            </p>

            <Textarea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`Size\tLength\tBust\tSleeve\n52\t52\t20\t26\n54\t54\t21\t27\n56\t56\t22\t28`}
              className="font-mono text-xs leading-relaxed"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPasteDialogOpen(false)}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="button" size="sm" onClick={handleApplyPaste} className="gap-1.5">
              <Check className="h-4 w-4" />
              <span>{isAr ? "تطبيق الجدول المستورد" : "Apply Imported Table"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span>{isAr ? "تأكيد حذف دليل المقاسات" : "Confirm Deletion"}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs text-muted-foreground pt-1">
            <p>
              {isAr
                ? `هل أنت متأكد من رغبتك في حذف "${form.name_ar}"؟`
                : `Are you sure you want to delete "${form.name_en}"?`}
            </p>
            <p>
              {isAr
                ? "سيتم فك ارتباط أي منتجات أو أقسام كانت مرتبطة بهذا الدليل، وستعود لاستخدام الدليل الافتراضي للمتجر."
                : "Any products or categories currently linked to this guide will automatically fallback to the store default."}
            </p>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              <span>{isAr ? "حذف نهائي" : "Delete Permanently"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SizeGuidesStudioPage;
