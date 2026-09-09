import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Download,
  ImageIcon,
  Instagram,
  MessageSquareHeart,
  Palette,
  Phone,
  Sparkles,
  Move,
  Sliders,
  RotateCcw,
  Layers,
  Video,
  Image as LucideImage,
  Sun,
  Moon,
  Eye,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/content-studio")({
  component: ContentStudioPage,
});

type Product = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  image_url: string | null;
  media: unknown;
  base_price: number | null;
  fabric_type?: string | null;
  occasion?: string | null;
};

const FORMATS = {
  story: { ar: "ستوري", en: "Story", width: 1080, height: 1920, ratio: "aspect-[9/16]" },
  portrait: { ar: "بوست 4:5", en: "Post 4:5", width: 1080, height: 1350, ratio: "aspect-[4/5]" },
  square: { ar: "مربع", en: "Square", width: 1080, height: 1080, ratio: "aspect-square" },
} as const;

const THEMES = {
  editorial: {
    ar: "تحريري",
    en: "Editorial",
    bg: "#f4eee9",
    ink: "#330a0a",
    panel: "rgba(255,255,255,.68)",
  },
  maison: {
    ar: "دار الأزياء",
    en: "Maison",
    bg: "#330a0a",
    ink: "#fffaf6",
    panel: "rgba(51,10,10,.64)",
  },
  minimal: {
    ar: "هادئ",
    en: "Minimal",
    bg: "#e8ddd5",
    ink: "#330a0a",
    panel: "rgba(244,238,233,.7)",
  },
} as const;

function firstImage(product?: Product) {
  if (!product) return null;
  if (product.image_url) return product.image_url;
  const media = Array.isArray(product.media) ? product.media : [];
  const item = media.find((entry: any) => {
    const url = typeof entry === "string" ? entry : entry?.url;
    return url && !/\.(mp4|webm|mov)(\?|$)/i.test(url);
  });
  return typeof item === "string" ? item : item?.url || null;
}

function instagramHandle(socials: unknown) {
  if (!Array.isArray(socials)) return null;
  const item = socials.find((social: any) =>
    `${social?.name ?? ""} ${social?.url ?? ""}`.toLowerCase().includes("instagram"),
  ) as any;
  if (!item?.url) return null;
  const handle = item.url
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/[/@]+$/g, "");
  return handle ? `@${handle.replace(/^@/, "")}` : null;
}

function containsArabic(value: string) {
  return /[\u0600-\u06ff]/.test(value);
}

function ContentStudioPage() {
  const { slug } = Route.useParams();
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brandNameEn = brand.name_en || (brand as any).name || "Brand";
  const brandNameDisplay = isAr ? brand.name_ar || (brand as any).name || brandNameEn : brandNameEn;
  const brandSlugClean = brand.slug || slug || "brand";
  const defaultEditionLabel = `The ${brandNameEn} Edit`;

  const stageRef = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<keyof typeof FORMATS>("story");
  const [theme, setTheme] = useState<keyof typeof THEMES>("editorial");
  const [productId, setProductId] = useState("");
  const [editionLabel, setEditionLabel] = useState(() => defaultEditionLabel);
  const [headline, setHeadline] = useState("صُممت لتبقى في الذاكرة");
  const [body, setBody] = useState("أناقة هادئة، وتفاصيل مدروسة لكل لحظة.");
  const [showPrice, setShowPrice] = useState(true);
  const [imageFit, setImageFit] = useState<"cover" | "contain">("cover");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setEditionLabel((prev) => {
      if (!prev || prev === "The Pura Edit" || (prev.startsWith("The ") && prev.endsWith(" Edit"))) {
        return `The ${brandNameEn} Edit`;
      }
      return prev;
    });
  }, [brandNameEn]);

  const productsQ = useQuery({
    queryKey: ["content-studio-products", brand.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,name_ar,name_en,description,description_ar,image_url,media,base_price,fabric_type,occasion")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
  const variantsQ = useQuery({
    queryKey: ["content-studio-variants", brand.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id,product_id,size,color,fabric,selling_price,original_price,image_url,stock_main,stock_incubator")
        .eq("brand_id", brand.id);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        product_id: string;
        size: string | null;
        color: string | null;
        fabric: string | null;
        selling_price: number | null;
        original_price: number | null;
        image_url: string | null;
        stock_main: number | null;
        stock_incubator: number | null;
      }>;
    },
  });
  const settingsQ = useQuery({
    queryKey: ["content-studio-settings", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("business_settings") as any)
        .select("business_name,phone,whatsapp_number,socials,logo_url,primary_color,currency")
        .eq("brand_id", brand.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const products = productsQ.data ?? [];
  const selected = products.find((product) => product.id === productId) ?? products[0];

  type StudioMediaItem = {
    url: string;
    type: "image" | "video";
    source: "primary" | "gallery" | "variant";
    label: string;
  };

  const productVariants = useMemo(() => {
    if (!selected) return [];
    return (variantsQ.data ?? []).filter((v) => v.product_id === selected.id);
  }, [selected, variantsQ.data]);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string | null>(null);

  // Header customization state
  const [headerScale, setHeaderScale] = useState(1.0);
  const [headerLogoHeight, setHeaderLogoHeight] = useState(48);
  const [headerPosY, setHeaderPosY] = useState(4.5);
  const [headerPosX, setHeaderPosX] = useState(0);
  const [headerPlateStyle, setHeaderPlateStyle] = useState<"none" | "glass" | "solid">("none");
  const [headerPlateColor, setHeaderPlateColor] = useState("rgba(0, 0, 0, 0.48)");
  const [headerTextColor, setHeaderTextColor] = useState<"white" | "dark">("white");
  const [headerBadgeText, setHeaderBadgeText] = useState("Bahrain");
  const [headerShowBadge, setHeaderShowBadge] = useState(true);
  const [isDraggingHeader, setIsDraggingHeader] = useState(false);

  const activeVariant = useMemo(() => {
    if (!selectedVariantId) return null;
    return productVariants.find((v) => v.id === selectedVariantId) ?? null;
  }, [productVariants, selectedVariantId]);

  const productMediaList = useMemo(() => {
    if (!selected) return [];
    const list: StudioMediaItem[] = [];
    const seenUrls = new Set<string>();

    const add = (
      url: string | null | undefined,
      type: "image" | "video",
      source: "primary" | "gallery" | "variant",
      label: string,
    ) => {
      if (!url || seenUrls.has(url)) return;
      seenUrls.add(url);
      list.push({ url, type, source, label });
    };

    if (selected.image_url) {
      add(selected.image_url, "image", "primary", isAr ? "الأساسية" : "Main");
    }

    if (Array.isArray(selected.media)) {
      selected.media.forEach((item: any, idx: number) => {
        const url = typeof item === "string" ? item : item?.url;
        if (!url) return;
        const isVid =
          typeof item === "object" && item.type === "video"
            ? true
            : /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
        add(
          url,
          isVid ? "video" : "image",
          "gallery",
          isVid ? `${isAr ? "فيديو" : "Video"} ${idx + 1}` : `${isAr ? "صورة" : "Image"} ${idx + 1}`,
        );
      });
    }

    productVariants.forEach((v) => {
      if (v.image_url) {
        const vLabel = [v.size, v.color].filter(Boolean).join(" · ") || (isAr ? "متغير" : "Variant");
        add(v.image_url, "image", "variant", vLabel);
      }
    });

    return list;
  }, [selected, productVariants, isAr]);

  useEffect(() => {
    if (productMediaList.length > 0) {
      const match = productMediaList.some((m) => m.url === selectedMediaUrl);
      if (!match) {
        setSelectedMediaUrl(productMediaList[0].url);
      }
    } else {
      setSelectedMediaUrl(null);
    }
  }, [selected?.id, productMediaList, selectedMediaUrl]);

  const handleSelectVariant = (variantId: string | null) => {
    setSelectedVariantId(variantId);
    if (variantId) {
      const v = productVariants.find((item) => item.id === variantId);
      if (v?.image_url) {
        setSelectedMediaUrl(v.image_url);
      }
    }
  };

  const currentMedia = useMemo(() => {
    return productMediaList.find((m) => m.url === selectedMediaUrl) ?? productMediaList[0] ?? null;
  }, [productMediaList, selectedMediaUrl]);

  const photo = currentMedia?.url ?? firstImage(selected);
  const isCurrentVideo = currentMedia?.type === "video";

  const effectivePrice =
    activeVariant?.selling_price != null ? activeVariant.selling_price : selected?.base_price ?? null;

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (exporting) return;
    e.preventDefault();
    setIsDraggingHeader(true);
    const startY = e.clientY;
    const startPosY = headerPosY;
    const stageEl = stageRef.current;
    const stageHeight = stageEl ? stageEl.offsetHeight : 1;

    const onPointerMove = (moveEv: PointerEvent) => {
      const deltaY = moveEv.clientY - startY;
      const deltaPercent = (deltaY / stageHeight) * 100;
      const nextY = Math.max(1, Math.min(82, startPosY + deltaPercent));
      setHeaderPosY(Math.round(nextY * 10) / 10);
    };

    const onPointerUp = () => {
      setIsDraggingHeader(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const resetHeaderLayout = () => {
    setHeaderScale(1.0);
    setHeaderLogoHeight(48);
    setHeaderPosY(4.5);
    setHeaderPosX(0);
    setHeaderPlateStyle("none");
    setHeaderPlateColor("rgba(0, 0, 0, 0.48)");
    setHeaderTextColor("white");
    setHeaderBadgeText("Bahrain");
    setHeaderShowBadge(true);
  };

  const businessName =
    settingsQ.data?.business_name || (isAr ? brand.name_ar : brand.name_en) || brand.name_en;
  const logo = settingsQ.data?.logo_url || brand.logo_url;
  const phone = settingsQ.data?.phone || settingsQ.data?.whatsapp_number;
  const instagram = instagramHandle(settingsQ.data?.socials);
  const currency = settingsQ.data?.currency || "BHD";
  const currencySymbol = isAr
    ? currency === "BHD"
      ? "د.ب."
      : currency === "SAR"
        ? "ر.س."
        : currency === "KWD"
          ? "د.ك."
          : currency
    : currency;
  const palette = THEMES[theme];
  const editionIsAr = containsArabic(editionLabel);
  const headlineIsAr = containsArabic(headline);
  const bodyIsAr = containsArabic(body);
  const fallbackLineName = `${brandNameEn.toUpperCase()} LINE`;
  const productName = selected
    ? isAr
      ? selected.name_ar || selected.name
      : selected.name_en || selected.name
    : fallbackLineName;

  const exportCreative = async () => {
    if (!stageRef.current) return;
    setExporting(true);
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const target = FORMATS[format];
      const canvas = await html2canvas(stageRef.current, {
        backgroundColor: palette.bg,
        scale: target.width / stageRef.current.offsetWidth,
        useCORS: true,
        logging: false,
      });
      const fileName = `${brandSlugClean}-${selected?.name || "creative"}-${format}.png`
        .replace(/\s+/g, "-")
        .toLowerCase();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error("PNG export failed"))),
          "image/png",
          1,
        ),
      );
      const file = new File([blob], fileName, { type: "image/png" });
      const isMobileDevice =
        window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 900;
      const canShareFile =
        isMobileDevice &&
        typeof navigator.share === "function" &&
        navigator.canShare?.({ files: [file] });

      if (canShareFile) {
        try {
          await navigator.share({ files: [file], title: headline || businessName });
          toast.success(
            isAr ? "التصميم جاهز للحفظ أو المشاركة" : "Creative ready to save or share",
          );
          return;
        } catch (shareError) {
          if (shareError instanceof DOMException && shareError.name === "AbortError") return;
          console.warn("Native file sharing was unavailable; using download fallback", shareError);
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = fileName;
      link.href = url;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success(
        isAr
          ? `تم تنزيل التصميم ${target.width}×${target.height}`
          : `Downloaded at ${target.width}×${target.height}`,
      );
    } catch (error) {
      console.error(error);
      toast.error(
        isAr
          ? "تعذر تصدير التصميم. تحقق من صورة المنتج."
          : "Could not export. Check the product image.",
      );
    } finally {
      setExporting(false);
    }
  };

  const selectedDescription = useMemo(
    () =>
      selected
        ? isAr
          ? selected.description_ar || selected.description
          : selected.description
        : null,
    [isAr, selected],
  );

  const [copiedCaption, setCopiedCaption] = useState(false);

  const captionText = useMemo(() => {
    if (!selected) return "";
    const title = headline.trim() ? `✨ ${headline.trim()}` : "✨ [العنوان العاطفي]";
    const desc = body.trim() || selectedDescription || "";

    const pVariants = (variantsQ.data ?? []).filter((v) => v.product_id === selected.id);
    const availableSizes = Array.from(
      new Set(
        pVariants
          .filter(
            (v) => (Number(v.stock_main) || 0) + (Number(v.stock_incubator) || 0) > 0 && v.size,
          )
          .map((v) => v.size!.trim()),
      ),
    );

    const sizesFormatted =
      availableSizes.length > 0 ? availableSizes.join(" · ") : "";

    const occasionFormatted = selected.occasion ? selected.occasion.trim() : "";
    const fabricFormatted = selected.fabric_type ? selected.fabric_type.trim() : "";
    const priceFormatted = effectivePrice != null ? Number(effectivePrice).toFixed(3) : "0.000";

    const details: string[] = [];
    if (sizesFormatted) {
      details.push(`📏 المقاسات المتوفرة للبيع الفوري: ${sizesFormatted}`);
    } else {
      details.push("📏 المقاسات: متوفرة للتفصيل حسب الطلب");
    }
    if (occasionFormatted) {
      details.push(`👗 مناسبة لـ: ${occasionFormatted}`);
    }
    if (fabricFormatted) {
      details.push(`🧵 نوع القماش: ${fabricFormatted}`);
    }
    details.push("✂️ متوفرة للتفصيل حسب الطلب: نعم");

    const detailsBlock = details.length > 0 ? `\n\n${details.join("\n")}` : "";

    return `${title}
${desc}${detailsBlock}

💰 ${priceFormatted} ${currencySymbol}`;
  }, [selected, headline, body, selectedDescription, variantsQ.data, currencySymbol]);

  const handleCopyCaption = async () => {
    if (!captionText) return;
    try {
      await navigator.clipboard.writeText(captionText);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
      toast.success(
        isAr ? "تم نسخ كابشن انستقرام للحافظة بنجاح!" : "Instagram caption copied to clipboard!",
      );
    } catch {
      toast.error(isAr ? "تعذر النسخ للحافظة" : "Failed to copy to clipboard");
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-1 sm:p-2" dir={isAr ? "rtl" : "ltr"}>
      <section className="relative overflow-hidden rounded-[28px] border bg-card px-5 py-7 shadow-sm sm:px-8">
        <div className="absolute inset-y-0 end-0 w-64 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/.13),transparent_68%)]" />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="flex items-start gap-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
              <Palette className="size-5" />
            </span>
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-primary">
                <Sparkles className="size-3.5" />
                {`${brandNameEn} Content Studio`}
              </div>
              <h1 className="font-display text-3xl font-black sm:text-4xl">
                {isAr ? "من المنتج إلى محتوى جاهز للنشر" : "From product to publish-ready creative"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {isAr
                  ? "استديو بصري يحافظ على هوية البراند ويصدّر المقاس الصحيح لكل منصة."
                  : "A focused visual studio that protects your brand language and exports the right social size."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyCaption}
              size="lg"
              className="gap-2 rounded-xl border-border bg-background/80 shadow-sm hover:bg-muted/50"
            >
              {copiedCaption ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4 text-primary" />}
              {isAr ? "نسخ كابشن انستقرام" : "Copy Instagram Caption"}
            </Button>
            <Button
              onClick={exportCreative}
              disabled={exporting || productsQ.isLoading}
              size="lg"
              className="gap-2 rounded-xl"
            >
              <Download className="size-4" />
              {exporting
                ? isAr
                  ? "جارٍ التصدير…"
                  : "Exporting…"
                : isAr
                  ? "تنزيل PNG"
                  : "Download PNG"}
            </Button>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,0.82fr)_minmax(480px,1.18fr)]">
        <Card className="overflow-hidden rounded-[24px] border-border/70 shadow-sm xl:sticky xl:top-4">
          <div className="border-b p-5">
            <h2 className="font-display text-xl font-bold">
              {isAr ? "اتجاه التصميم" : "Creative direction"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAr
                ? "كل تعديل يظهر مباشرة في المعاينة."
                : "Every change appears instantly in the preview."}
            </p>
          </div>
          <div className="space-y-6 p-5">
            <div>
            {/* Product Selector */}
            <div className="space-y-3">
              <div>
                <Label>{isAr ? "المنتج" : "Product"}</Label>
                <Select value={selected?.id ?? ""} onValueChange={setProductId}>
                  <SelectTrigger className="mt-2 h-12 rounded-xl">
                    <SelectValue placeholder={isAr ? "اختيار منتج" : "Choose a product"} />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {isAr ? product.name_ar || product.name : product.name_en || product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Variant Selector (if product has multiple variants) */}
              {productVariants.length > 0 && (
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      {isAr ? "المتغير / المقاس واللون" : "Product Variant"}
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      {productVariants.length} {isAr ? "خيارات" : "options"}
                    </span>
                  </div>
                  <Select
                    value={selectedVariantId || "all"}
                    onValueChange={(val) => handleSelectVariant(val === "all" ? null : val)}
                  >
                    <SelectTrigger className="mt-1.5 h-10 rounded-xl text-xs bg-muted/20">
                      <SelectValue placeholder={isAr ? "جميع المتغيرات / الأساسي" : "All variants (base)"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {isAr ? "المنتج الأساسي (الافتراضي)" : "Base product (default)"}
                      </SelectItem>
                      {productVariants.map((v) => {
                        const labelParts = [v.size, v.color].filter(Boolean);
                        const vTitle = labelParts.length > 0 ? labelParts.join(" · ") : v.id.slice(0, 6);
                        const priceStr = v.selling_price != null ? ` · ${Number(v.selling_price).toFixed(3)} ${currencySymbol}` : "";
                        return (
                          <SelectItem key={v.id} value={v.id}>
                            {vTitle} {priceStr}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Media gallery selector (pictures & videos) */}
              {productMediaList.length > 1 && (
                <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <LucideImage className="size-3.5 text-primary" />
                      {isAr ? "اختيار صورة أو فيديو التصميم" : "Select design media"}
                    </span>
                    <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full">
                      {productMediaList.length} {isAr ? "عناصر" : "items"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-thin">
                    {productMediaList.map((item, idx) => {
                      const isSelected = item.url === selectedMediaUrl;
                      return (
                        <button
                          key={item.url + idx}
                          type="button"
                          onClick={() => setSelectedMediaUrl(item.url)}
                          className={cn(
                            "relative shrink-0 size-14 rounded-xl overflow-hidden border-2 transition-all group",
                            isSelected
                              ? "border-primary ring-2 ring-primary/30 scale-105 shadow-sm"
                              : "border-border hover:border-primary/50 opacity-75 hover:opacity-100",
                          )}
                          title={item.label}
                        >
                          {item.type === "video" ? (
                            <div className="size-full bg-neutral-900 flex flex-col items-center justify-center text-white p-1">
                              <Video className="size-5 text-primary" />
                              <span className="text-[9px] font-bold mt-0.5">MP4</span>
                            </div>
                          ) : (
                            <img
                              src={item.url}
                              alt=""
                              className="size-full object-cover"
                              crossOrigin="anonymous"
                            />
                          )}
                          {item.type === "video" && (
                            <span className="absolute bottom-0.5 end-0.5 bg-black/80 text-[8px] text-white px-1 rounded font-semibold flex items-center gap-0.5">
                              <Video className="size-2" />
                            </span>
                          )}
                          {isSelected && (
                            <span className="absolute top-0.5 start-0.5 bg-primary text-primary-foreground size-4 rounded-full flex items-center justify-center shadow">
                              <Check className="size-2.5 stroke-[3]" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Publish Size */}
            <div>
              <Label>{isAr ? "مقاس النشر" : "Publish size"}</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {Object.entries(FORMATS).map(([key, item]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setFormat(key as keyof typeof FORMATS)}
                    className={cn(
                      "relative rounded-xl border p-3 text-start transition-all",
                      format === key
                        ? "border-primary bg-primary/[0.06] ring-1 ring-primary"
                        : "hover:border-primary/40",
                    )}
                  >
                    <span className="block text-sm font-bold">{isAr ? item.ar : item.en}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      {item.width}×{item.height}
                    </span>
                    {format === key && (
                      <Check className="absolute end-2 top-2 size-3.5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Visual Style */}
            <div>
              <Label>{isAr ? "الأسلوب" : "Visual style"}</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {Object.entries(THEMES).map(([key, item]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setTheme(key as keyof typeof THEMES)}
                    className={cn(
                      "rounded-xl border p-3 text-start transition-all",
                      theme === key
                        ? "border-primary ring-1 ring-primary"
                        : "hover:border-primary/40",
                    )}
                  >
                    <span className="mb-3 flex gap-1">
                      <i className="size-4 rounded-full border" style={{ background: item.bg }} />
                      <i className="size-4 rounded-full" style={{ background: item.ink }} />
                    </span>
                    <span className="text-xs font-bold">{isAr ? item.ar : item.en}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Product Framing */}
            <div>
              <Label>{isAr ? "طريقة عرض صورة المنتج" : "Product photo framing"}</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setImageFit("cover")}
                  className={cn(
                    "relative rounded-xl border p-3 text-start transition-all",
                    imageFit === "cover"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:border-primary/40",
                  )}
                >
                  <span className="block text-xs font-bold">
                    {isAr ? "ملء الإطار (قص)" : "Cover frame"}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {isAr ? "تكبير الصورة لملء الخلفية" : "Fills canvas boundary"}
                  </span>
                  {imageFit === "cover" && (
                    <Check className="absolute end-2 top-2 size-3.5 text-primary" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setImageFit("contain")}
                  className={cn(
                    "relative rounded-xl border p-3 text-start transition-all",
                    imageFit === "contain"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:border-primary/40",
                  )}
                >
                  <span className="block text-xs font-bold">
                    {isAr ? "احتواء كامل (كاملة)" : "Fit / Contain"}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {isAr ? "حفظ كامل تفاصيل الصورة" : "Preserves full photo"}
                  </span>
                  {imageFit === "contain" && (
                    <Check className="absolute end-2 top-2 size-3.5 text-primary" />
                  )}
                </button>
              </div>
            </div>

            {/* Header & Branding Bar Customization Card */}
            <div className="rounded-2xl border border-border/80 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Sliders className="size-3.5" />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">
                      {isAr ? "شريط الشعار والترويسة" : "Header & Branding Bar"}
                    </h3>
                    <p className="text-[10px] text-muted-foreground">
                      {isAr ? "تخصيص الموضع والحجم وخلفية الشعار" : "Position, resize & backdrop plate"}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetHeaderLayout}
                  className="h-7 gap-1 px-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                  title={isAr ? "استعادة الموضع والحجم الافتراضي" : "Reset layout"}
                >
                  <RotateCcw className="size-3" />
                  {isAr ? "إعادة ضبط" : "Reset"}
                </Button>
              </div>

              {/* Text Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="studio-edition-label" className="text-xs">
                    {isAr ? "العبارة بجانب الشعار" : "Edition label"}
                  </Label>
                  <Input
                    id="studio-edition-label"
                    value={editionLabel}
                    maxLength={28}
                    onChange={(event) => setEditionLabel(event.target.value)}
                    className="mt-1.5 h-9 rounded-xl text-xs"
                    placeholder={defaultEditionLabel}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="studio-badge-text" className="text-xs">
                      {isAr ? "شارة الموقع / الدولة" : "Location badge"}
                    </Label>
                    <button
                      type="button"
                      onClick={() => setHeaderShowBadge(!headerShowBadge)}
                      className="text-[10px] text-primary font-semibold hover:underline"
                    >
                      {headerShowBadge ? (isAr ? "إخفاء" : "Hide") : (isAr ? "إظهار" : "Show")}
                    </button>
                  </div>
                  <Input
                    id="studio-badge-text"
                    value={headerBadgeText}
                    maxLength={16}
                    disabled={!headerShowBadge}
                    onChange={(event) => setHeaderBadgeText(event.target.value)}
                    className="mt-1.5 h-9 rounded-xl text-xs"
                    placeholder="Bahrain"
                  />
                </div>
              </div>

              {/* Backdrop Plate Style (None / Glassmorphic / Solid) */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">
                  {isAr ? "خلفية شريط الشعار (لزيادة الوضوح)" : "Header backdrop plate"}
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setHeaderPlateStyle("none")}
                    className={cn(
                      "rounded-xl border p-2 text-center text-xs font-bold transition-all",
                      headerPlateStyle === "none"
                        ? "border-primary bg-primary/[0.08] ring-1 ring-primary text-primary"
                        : "border-border bg-background/50 hover:border-primary/40 text-muted-foreground",
                    )}
                  >
                    {isAr ? "شفاف" : "None"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderPlateStyle("glass");
                      if (headerPlateColor === "#1a1a1a") setHeaderPlateColor("rgba(0, 0, 0, 0.48)");
                    }}
                    className={cn(
                      "rounded-xl border p-2 text-center text-xs font-bold transition-all",
                      headerPlateStyle === "glass"
                        ? "border-primary bg-primary/[0.08] ring-1 ring-primary text-primary"
                        : "border-border bg-background/50 hover:border-primary/40 text-muted-foreground",
                    )}
                  >
                    {isAr ? "زجاجي مضبب" : "Glass"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderPlateStyle("solid");
                      if (headerPlateColor.startsWith("rgba")) setHeaderPlateColor("#1a1a1a");
                    }}
                    className={cn(
                      "rounded-xl border p-2 text-center text-xs font-bold transition-all",
                      headerPlateStyle === "solid"
                        ? "border-primary bg-primary/[0.08] ring-1 ring-primary text-primary"
                        : "border-border bg-background/50 hover:border-primary/40 text-muted-foreground",
                    )}
                  >
                    {isAr ? "خلفية مصمتة" : "Solid"}
                  </button>
                </div>

                {/* Plate Color & Contrast Settings */}
                {headerPlateStyle !== "none" && (
                  <div className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-3 pt-2.5">
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5 font-medium">
                        <span>{isAr ? "لون الخلفية" : "Plate color"}</span>
                        <span>{headerPlateColor}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {headerPlateStyle === "glass" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setHeaderPlateColor("rgba(0, 0, 0, 0.52)");
                                setHeaderTextColor("white");
                              }}
                              className={cn(
                                "h-7 px-2.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1.5",
                                headerPlateColor === "rgba(0, 0, 0, 0.52)"
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border",
                              )}
                              style={{ background: "rgba(0, 0, 0, 0.52)", color: "#fff" }}
                            >
                              <Moon className="size-2.5" />
                              {isAr ? "زجاج داكن" : "Dark glass"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setHeaderPlateColor("rgba(255, 255, 255, 0.78)");
                                setHeaderTextColor("dark");
                              }}
                              className={cn(
                                "h-7 px-2.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1.5",
                                headerPlateColor === "rgba(255, 255, 255, 0.78)"
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border",
                              )}
                              style={{ background: "rgba(255, 255, 255, 0.78)", color: "#111" }}
                            >
                              <Sun className="size-2.5" />
                              {isAr ? "زجاج فاتح" : "Light glass"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setHeaderPlateColor("rgba(51, 10, 10, 0.65)");
                                setHeaderTextColor("white");
                              }}
                              className={cn(
                                "h-7 px-2.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1.5",
                                headerPlateColor === "rgba(51, 10, 10, 0.65)"
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border",
                              )}
                              style={{ background: "rgba(51, 10, 10, 0.65)", color: "#fff" }}
                            >
                              <Palette className="size-2.5" />
                              {isAr ? "براند" : "Brand"}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setHeaderPlateColor("#111111");
                                setHeaderTextColor("white");
                              }}
                              className={cn(
                                "h-7 px-2.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1.5",
                                headerPlateColor === "#111111"
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border",
                              )}
                              style={{ background: "#111111", color: "#fff" }}
                            >
                              {isAr ? "أسود" : "Black"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setHeaderPlateColor("#ffffff");
                                setHeaderTextColor("dark");
                              }}
                              className={cn(
                                "h-7 px-2.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1.5",
                                headerPlateColor === "#ffffff"
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border",
                              )}
                              style={{ background: "#ffffff", color: "#111" }}
                            >
                              {isAr ? "أبيض" : "White"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setHeaderPlateColor(palette.ink);
                                setHeaderTextColor("white");
                              }}
                              className={cn(
                                "h-7 px-2.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1.5",
                                headerPlateColor === palette.ink
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border",
                              )}
                              style={{ background: palette.ink, color: palette.bg }}
                            >
                              <Palette className="size-2.5" />
                              {isAr ? "لون النمط" : "Theme ink"}
                            </button>
                          </>
                        )}
                        <label className="flex items-center gap-1.5 h-7 px-2 rounded-lg border border-border bg-background cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                          <input
                            type="color"
                            value={headerPlateColor.startsWith("#") ? headerPlateColor : "#1a1a1a"}
                            onChange={(e) => setHeaderPlateColor(e.target.value)}
                            className="size-4 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                          <span>{isAr ? "مخصص" : "Custom"}</span>
                        </label>
                      </div>
                    </div>

                    {/* Text Contrast Mode */}
                    <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {isAr ? "تباين الشعار والنصوص" : "Content contrast"}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setHeaderTextColor("white")}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all",
                            headerTextColor === "white"
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          ⚪ {isAr ? "أبيض" : "Light"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setHeaderTextColor("dark")}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all",
                            headerTextColor === "dark"
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          ⚫ {isAr ? "داكن" : "Dark"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Resize & Drag Fine-Tuning Controls */}
              <div className="space-y-3 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1.5 text-foreground">
                    <Move className="size-3.5 text-primary" />
                    {isAr ? "الموضع والارتفاع" : "Position & Sizing"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {isAr ? "اسحب بالماوس مباشرة أو اضبط هنا" : "Drag on canvas or adjust"}
                  </span>
                </div>

                {/* Vertical Position (Y) */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{isAr ? "الموضع العمودي (من الأعلى)" : "Vertical position (Y)"}</span>
                    <span className="font-bold text-foreground">{headerPosY}%</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="75"
                    step="0.5"
                    value={headerPosY}
                    onChange={(e) => setHeaderPosY(parseFloat(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                  />
                </div>

                {/* Logo Height */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{isAr ? "ارتفاع الشعار" : "Logo height"}</span>
                    <span className="font-bold text-foreground">{headerLogoHeight}px</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="80"
                    step="2"
                    value={headerLogoHeight}
                    onChange={(e) => setHeaderLogoHeight(parseInt(e.target.value, 10))}
                    className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                  />
                </div>

                {/* Overall Scale */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{isAr ? "مقياس الترويسة الكاملة" : "Overall header scale"}</span>
                    <span className="font-bold text-foreground">{Math.round(headerScale * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.4"
                    step="0.05"
                    value={headerScale}
                    onChange={(e) => setHeaderScale(parseFloat(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
              <div>
                <Label htmlFor="studio-headline">{isAr ? "العنوان" : "Headline"}</Label>
                <Input
                  id="studio-headline"
                  value={headline}
                  maxLength={64}
                  onChange={(event) => setHeadline(event.target.value)}
                  className="mt-2 h-11 rounded-xl"
                />
              </div>
              <div>
                <Label htmlFor="studio-body">{isAr ? "النص" : "Body copy"}</Label>
                <Textarea
                  id="studio-body"
                  value={body}
                  maxLength={160}
                  rows={3}
                  onChange={(event) => setBody(event.target.value)}
                  className="mt-2 rounded-xl"
                  placeholder={selectedDescription || ""}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border bg-muted/20 px-3.5 py-2.5">
                <Label htmlFor="studio-show-price" className="text-xs font-semibold cursor-pointer">
                  {isAr ? "إظهار السعر على البطاقة" : "Show price on card"}
                </Label>
                <Switch
                  id="studio-show-price"
                  checked={showPrice}
                  onCheckedChange={setShowPrice}
                />
              </div>
              <div className="rounded-2xl border bg-muted/20 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-primary">
                    <Sparkles className="size-3.5" />
                    {isAr ? "كابشن انستقرام التلقائي" : "Auto Instagram Caption"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleCopyCaption}
                    className="h-7 text-xs font-semibold gap-1 px-2.5"
                  >
                    {copiedCaption ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                    {copiedCaption ? (isAr ? "تم النسخ" : "Copied") : (isAr ? "نسخ" : "Copy")}
                  </Button>
                </div>
                <pre
                  dir="rtl"
                  className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted-foreground bg-background/80 p-3 rounded-xl border select-all"
                >
                  {captionText}
                </pre>
              </div>
            </div>
            <Link
              to="/admin/b/$slug/reviews"
              params={{ slug }}
              className="flex items-center justify-between rounded-2xl border bg-muted/30 p-4 transition-colors hover:bg-muted/60"
            >
              <span className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-background">
                  <MessageSquareHeart className="size-4 text-primary" />
                </span>
                <span>
                  <strong className="block text-sm">
                    {isAr ? "آراء العملاء" : "Customer stories"}
                  </strong>
                  <small className="text-muted-foreground">
                    {isAr ? "تحويل أي تقييم إلى ستوري" : "Turn any review into a story"}
                  </small>
                </span>
              </span>
              <span aria-hidden>↗</span>
            </Link>
          </div>
        </Card>

        <div className="rounded-[28px] border bg-[#ece7e2] p-4 sm:p-7">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p
                className={cn(
                  "text-xs font-bold text-muted-foreground",
                  !isAr && "uppercase tracking-[.15em]",
                )}
              >
                {isAr ? "معاينة مباشرة" : "Live preview"}
              </p>
              <p className="mt-1 text-sm font-semibold">
                {FORMATS[format].width} × {FORMATS[format].height} px
              </p>
            </div>
            <ImageIcon className="size-5 text-muted-foreground" />
          </div>
          <div className="mx-auto max-w-[570px] overflow-hidden rounded-[22px] shadow-2xl">
            <div
              ref={stageRef}
              className={cn("relative isolate w-full overflow-hidden", FORMATS[format].ratio)}
              style={{ background: palette.bg, color: palette.ink }}
            >
              {photo ? (
                isCurrentVideo ? (
                  <video
                    src={photo}
                    crossOrigin="anonymous"
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : imageFit === "contain" ? (
                  <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                    <img
                      src={photo}
                      crossOrigin="anonymous"
                      alt=""
                      className="absolute inset-0 size-full object-cover blur-2xl scale-125 opacity-70 brightness-75 select-none"
                    />
                    <div className="absolute inset-0 bg-black/20" />
                    <img
                      src={photo}
                      crossOrigin="anonymous"
                      alt=""
                      className="relative z-10 max-h-full max-w-full object-contain drop-shadow-[0_16px_32px_rgba(0,0,0,0.4)] select-none"
                    />
                  </div>
                ) : (
                  <img
                    src={photo}
                    crossOrigin="anonymous"
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                )
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(214,177,130,.65),transparent_28%),radial-gradient(circle_at_80%_75%,rgba(51,10,10,.22),transparent_30%)]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent via-70% to-black/20" />

              {/* Draggable & Customizable Header Bar */}
              <div
                dir="ltr"
                onPointerDown={handleHeaderPointerDown}
                className={cn(
                  "absolute inset-x-[5%] z-20 flex items-center justify-between gap-3 transition-shadow select-none",
                  !exporting &&
                    "cursor-grab active:cursor-grabbing group hover:ring-2 hover:ring-primary/60 hover:ring-offset-2 hover:ring-offset-black/30 rounded-2xl",
                  isDraggingHeader && "cursor-grabbing ring-2 ring-primary ring-offset-2",
                  headerPlateStyle === "glass" &&
                    "backdrop-blur-md shadow-lg border border-white/20 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl",
                  headerPlateStyle === "solid" &&
                    "shadow-md border border-white/10 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl",
                  headerPlateStyle === "none" && "px-1 py-1",
                )}
                style={{
                  top: `${headerPosY}%`,
                  transform: `scale(${headerScale})`,
                  transformOrigin: "center center",
                  backgroundColor:
                    headerPlateStyle === "glass"
                      ? headerPlateColor || "rgba(0, 0, 0, 0.48)"
                      : headerPlateStyle === "solid"
                        ? headerPlateColor || "#1a1a1a"
                        : "transparent",
                  color: headerTextColor === "dark" ? "#111827" : "#ffffff",
                }}
              >
                {/* Drag handle tooltip on hover (hidden during export) */}
                {!exporting && (
                  <div className="absolute -top-7 start-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                    <span className="flex items-center gap-1 text-[9px] font-bold bg-black/85 text-white px-2.5 py-0.5 rounded-full shadow-md whitespace-nowrap">
                      <Move className="size-2.5" />
                      {isAr ? "اسحب لتغيير الموضع" : "Drag to reposition"}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  {logo ? (
                    <img
                      src={logo}
                      crossOrigin="anonymous"
                      alt={businessName}
                      style={{ height: `${headerLogoHeight}px`, width: "auto" }}
                      className={cn(
                        "max-w-28 sm:max-w-36 object-contain pointer-events-none transition-all",
                        headerTextColor === "white" ? "brightness-0 invert" : "",
                      )}
                    />
                  ) : (
                    <span className="font-serif text-xl sm:text-2xl tracking-[.22em] pointer-events-none">
                      {brandNameEn.toUpperCase()}
                    </span>
                  )}
                  {editionLabel?.trim() ? (
                    <>
                      <span
                        className={cn(
                          "h-6 sm:h-7 w-px pointer-events-none",
                          headerTextColor === "dark" ? "bg-neutral-900/30" : "bg-white/40",
                        )}
                      />
                      <span
                        dir="auto"
                        lang={editionIsAr ? "ar" : "en"}
                        className={cn(
                          "font-semibold truncate pointer-events-none",
                          editionIsAr
                            ? "text-[12px] sm:text-sm"
                            : "text-[9px] sm:text-[10px] uppercase tracking-[.22em]",
                        )}
                        style={editionIsAr ? { fontFamily: "Tahoma, Arial, sans-serif" } : undefined}
                      >
                        {editionLabel}
                      </span>
                    </>
                  ) : null}
                </div>

                {headerShowBadge && headerBadgeText?.trim() && (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 sm:px-3 sm:py-1 text-[8px] sm:text-[9px] font-bold uppercase tracking-[.16em] whitespace-nowrap pointer-events-none shrink-0",
                      headerTextColor === "dark"
                        ? "border border-neutral-900/30 bg-black/5 text-neutral-900"
                        : "border border-white/50 bg-white/10 text-white",
                    )}
                  >
                    {headerBadgeText}
                  </span>
                )}
              </div>
              <div
                dir={isAr ? "rtl" : "ltr"}
                lang={isAr ? "ar" : "en"}
                className={cn(
                  "absolute bottom-[7.5%] w-[66%] overflow-hidden rounded-[18px] border border-white/25 px-[4%] py-[2.75%] shadow-xl backdrop-blur-[6px]",
                  isAr ? "right-[6%] text-right" : "left-[6%] text-left",
                )}
                style={{
                  background: palette.panel,
                  direction: isAr ? "rtl" : "ltr",
                  textAlign: isAr ? "right" : "left",
                }}
              >
                <div className="mb-[2.25%] flex items-center gap-2">
                  <span className="h-px w-6 bg-current opacity-45" />
                  <p className="text-[9px] font-black opacity-65">{productName}</p>
                </div>
                <h2
                  dir="auto"
                  lang={headlineIsAr ? "ar" : "en"}
                  className={cn(
                    "text-xl font-black leading-[1.3] sm:text-[30px]",
                    !headlineIsAr && "font-display tracking-tight",
                  )}
                  style={{
                    unicodeBidi: "plaintext",
                    fontFamily: headlineIsAr ? "Tahoma, Arial, sans-serif" : undefined,
                  }}
                >
                  {headline || " "}
                </h2>
                <p
                  dir="auto"
                  lang={bodyIsAr ? "ar" : "en"}
                  className="mt-[2.5%] max-w-[94%] text-[11px] font-medium leading-[1.65] opacity-80 sm:text-sm"
                  style={{
                    unicodeBidi: "plaintext",
                    fontFamily: bodyIsAr ? "Tahoma, Arial, sans-serif" : undefined,
                  }}
                >
                  {body || " "}
                </p>
                {showPrice && selected?.base_price ? (
                  <div
                    dir="ltr"
                    className="mt-[2.5%] flex items-center border-t border-current/15 pt-[2%]"
                  >
                    <span dir="ltr" className="font-black text-xs sm:text-sm tracking-tight">
                      {Number(selected.base_price).toFixed(3)} {currencySymbol}
                    </span>
                  </div>
                ) : null}
              </div>
              <div
                dir="ltr"
                className="absolute inset-x-[6%] bottom-[2.2%] flex items-center justify-between gap-3 text-[9px] font-semibold tracking-wide text-white"
              >
                <span className="flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
                  <Instagram className="size-3" /> {instagram || businessName}
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
                  <Phone className="size-3" /> {phone || `${slug}.boutq.store`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
