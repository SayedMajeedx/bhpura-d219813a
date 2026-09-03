import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Download,
  ImageIcon,
  Instagram,
  MessageSquareHeart,
  Palette,
  Phone,
  Sparkles,
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
    panel: "rgba(255,255,255,.86)",
  },
  maison: {
    ar: "دار الأزياء",
    en: "Maison",
    bg: "#330a0a",
    ink: "#fffaf6",
    panel: "rgba(51,10,10,.78)",
  },
  minimal: {
    ar: "هادئ",
    en: "Minimal",
    bg: "#e8ddd5",
    ink: "#330a0a",
    panel: "rgba(244,238,233,.88)",
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

function ContentStudioPage() {
  const { slug } = Route.useParams();
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const stageRef = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<keyof typeof FORMATS>("story");
  const [theme, setTheme] = useState<keyof typeof THEMES>("editorial");
  const [productId, setProductId] = useState("");
  const [headline, setHeadline] = useState("صُممت لتبقى في الذاكرة");
  const [body, setBody] = useState("أناقة هادئة، وتفاصيل مدروسة لكل لحظة.");
  const [cta, setCta] = useState("تسوّقي المجموعة");
  const [exporting, setExporting] = useState(false);

  const productsQ = useQuery({
    queryKey: ["content-studio-products", brand.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,name_ar,name_en,description,description_ar,image_url,media,base_price")
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
  const settingsQ = useQuery({
    queryKey: ["content-studio-settings", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("business_settings") as any)
        .select("business_name,phone,whatsapp_number,socials,logo_url,primary_color")
        .eq("brand_id", brand.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const products = productsQ.data ?? [];
  const selected = products.find((product) => product.id === productId) ?? products[0];
  const photo = firstImage(selected);
  const businessName =
    settingsQ.data?.business_name || (isAr ? brand.name_ar : brand.name_en) || brand.name_en;
  const logo = settingsQ.data?.logo_url || brand.logo_url;
  const phone = settingsQ.data?.phone || settingsQ.data?.whatsapp_number;
  const instagram = instagramHandle(settingsQ.data?.socials);
  const palette = THEMES[theme];
  const productName = selected
    ? isAr
      ? selected.name_ar || selected.name
      : selected.name_en || selected.name
    : "PURA LINE";

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
      const link = document.createElement("a");
      link.download = `pura-${selected?.name || "creative"}-${format}.png`
        .replace(/\s+/g, "-")
        .toLowerCase();
      link.href = canvas.toDataURL("image/png", 1);
      link.click();
      toast.success(
        isAr
          ? `تم تصدير التصميم ${target.width}×${target.height}`
          : `Exported at ${target.width}×${target.height}`,
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
                <Sparkles className="size-3.5" /> Pura Content Studio
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
              <Label>{isAr ? "المنتج" : "Product"}</Label>
              <Select value={selected?.id ?? ""} onValueChange={setProductId}>
                <SelectTrigger className="mt-2 h-12 rounded-xl">
                  <SelectValue placeholder={isAr ? "اختاري منتجاً" : "Choose a product"} />
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
            <div className="space-y-4">
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
              <div>
                <Label htmlFor="studio-cta">{isAr ? "الدعوة للإجراء" : "Call to action"}</Label>
                <Input
                  id="studio-cta"
                  value={cta}
                  maxLength={32}
                  onChange={(event) => setCta(event.target.value)}
                  className="mt-2 h-11 rounded-xl"
                />
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
                    {isAr ? "حوّلي أي تقييم إلى ستوري" : "Turn any review into a story"}
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
              <p className="text-xs font-bold uppercase tracking-[.15em] text-muted-foreground">
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
                <img
                  src={photo}
                  crossOrigin="anonymous"
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(214,177,130,.65),transparent_28%),radial-gradient(circle_at_80%_75%,rgba(51,10,10,.22),transparent_30%)]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/50" />
              <div className="absolute inset-x-[7%] top-[5%] flex items-center justify-between gap-3 text-white">
                <div className="flex items-center gap-3">
                  {logo ? (
                    <img
                      src={logo}
                      crossOrigin="anonymous"
                      alt={businessName}
                      className="h-12 w-auto max-w-32 object-contain brightness-0 invert"
                    />
                  ) : (
                    <span className="font-serif text-2xl tracking-[.22em]">PURA</span>
                  )}
                  <span className="h-8 w-px bg-white/40" />
                  <span className="text-[10px] font-semibold uppercase tracking-[.22em]">
                    New edit
                  </span>
                </div>
                <span className="rounded-full border border-white/50 px-3 py-1 text-[9px] font-bold uppercase tracking-[.16em]">
                  Bahrain
                </span>
              </div>
              <div
                className="absolute inset-x-[6%] bottom-[7%] overflow-hidden rounded-[26px] border border-white/35 p-[7%] shadow-2xl backdrop-blur-md"
                style={{ background: palette.panel }}
              >
                <p className="text-[10px] font-black uppercase tracking-[.22em] opacity-70">
                  {productName}
                </p>
                <h2 className="mt-[3%] font-display text-[clamp(24px,5vw,54px)] font-black leading-[1.05] tracking-tight">
                  {headline || " "}
                </h2>
                <p className="mt-[4%] max-w-[88%] text-[clamp(12px,2.1vw,21px)] font-medium leading-relaxed opacity-80">
                  {body || " "}
                </p>
                <div className="mt-[7%] flex items-end justify-between gap-4 border-t border-current/15 pt-[4%]">
                  <span
                    className="rounded-full px-5 py-2 text-[clamp(10px,1.6vw,15px)] font-black"
                    style={{ background: palette.ink, color: palette.bg }}
                  >
                    {cta}
                  </span>
                  {selected?.base_price ? (
                    <span className="text-end">
                      <small className="block text-[9px] uppercase tracking-widest opacity-60">
                        {isAr ? "ابتداءً من" : "From"}
                      </small>
                      <strong className="text-lg">
                        {Number(selected.base_price).toFixed(3)} د.ب.
                      </strong>
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="absolute inset-x-[7%] bottom-[2.2%] flex items-center justify-between text-[9px] font-semibold tracking-wide text-white/85">
                <span className="flex items-center gap-1.5">
                  <Instagram className="size-3" /> {instagram || businessName}
                </span>
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3" /> {phone || `boutq.store/${slug}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
