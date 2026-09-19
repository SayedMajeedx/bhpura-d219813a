import * as React from "react";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Building2, Upload, Crop, ExternalLink } from "lucide-react";
import { CropUploadButton } from "@/components/crop-upload-button";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { useBrandSettingsFormContext } from "../../use-brand-settings-form";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

export function BasicsGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { brandId, bs, brand, setBs } = useBrandSettingsFormContext();

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<"logo" | "favicon" | null>(null);

  const handleUpload = async (file: File | Blob, kind: "logo" | "favicon") => {
    try {
      setUploading(kind);
      const url = await uploadPublicMedia(brandId, file, kind);
      if (kind === "logo") {
        setBs("logo_url", url);
      } else {
        setBs("favicon_url", url);
      }
      toast.success(
        kind === "logo"
          ? isAr
            ? "تم رفع الشعار بنجاح"
            : "Logo uploaded successfully"
          : isAr
            ? "تم رفع أيقونة المتجر بنجاح"
            : "Favicon uploaded successfully"
      );
    } catch (e: any) {
      toast.error(e?.message ?? (isAr ? "فشل الرفع" : "Upload failed"));
    } finally {
      setUploading(null);
    }
  };

  return (
    <Card className="p-6 space-y-6 rounded-2xl border-border bg-card">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-display text-lg font-semibold">
            {isAr ? "البيانات الأساسية للمتجر" : "Basic Store Details"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "اسم المتجر، شعار العلامة، وأيقونة المتصفح"
              : "Store name, brand logo, and browser favicon"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Business Name */}
        <div className="space-y-2">
          <Label htmlFor="business_name">
            {isAr ? "اسم المتجر التجاري" : "Business Name"}
          </Label>
          <Input
            id="business_name"
            value={bs.business_name ?? ""}
            onChange={(e) => setBs("business_name", e.target.value)}
            placeholder={isAr ? "اسم المتجر" : "Store name"}
          />
        </div>

        {/* Store Slug (Read only display) */}
        <div className="space-y-2">
          <Label htmlFor="store_slug">
            {isAr ? "رابط المتجر (Slug)" : "Store URL (Slug)"}
          </Label>
          <div className="flex gap-2">
            <Input
              id="store_slug"
              value={brand.slug ?? ""}
              readOnly
              disabled
              className="bg-muted text-muted-foreground cursor-not-allowed"
            />
            {brand.slug && (
              <Button
                variant="outline"
                size="icon"
                asChild
                title={isAr ? "فتح المتجر" : "Open storefront"}
              >
                <a
                  href={`/${brand.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={isAr ? "زيارة المتجر" : "Visit store"}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "رابط المتجر فريد ومحدد عند الإنشاء. تواصل مع الدعم الفني لتغييره."
              : "Unique store slug established on creation. Contact support to change."}
          </p>
        </div>

        {/* Logo Upload */}
        <div className="space-y-2">
          <Label htmlFor="logo_url">{isAr ? "شعار المتجر" : "Store Logo"}</Label>
          <div className="flex gap-2">
            <Input
              id="logo_url"
              value={bs.logo_url ?? ""}
              placeholder="https://..."
              onChange={(e) => setBs("logo_url", e.target.value)}
            />
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/svg+xml,image/webp,image/jpeg,image/gif"
              className="hidden"
              onChange={(e) =>
                e.target.files?.[0] && handleUpload(e.target.files[0], "logo")
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploading === "logo"}
              title={
                isAr
                  ? "رفع الشعار مباشرة بدون قص (يحفظ الشفافية كما هي)"
                  : "Direct upload logo as-is (preserves transparency)"
              }
              aria-label={isAr ? "رفع الشعار مباشرة" : "Direct upload logo"}
            >
              <Upload className="h-4 w-4" />
            </Button>
            <CropUploadButton
              onCrop={(blob) => handleUpload(blob, "logo")}
              preset="logo"
              allowTransparency
              busy={uploading === "logo"}
              size="icon"
              variant="outline"
              title={isAr ? "تأطير وضبط الشعار (شفاف)" : "Frame and crop store logo"}
            >
              <Crop className="h-4 w-4" />
            </CropUploadButton>
          </div>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "يدعم صور PNG الشفافة وملفات SVG. يُحفظ الشعار بشفافيته الأصلية."
              : "Supports transparent PNG and SVG. Stored with full transparency."}
          </p>

          {bs.logo_url && (
            <div className="mt-2 flex items-center gap-3">
              <div
                className="relative h-12 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-[#18181b] p-1 flex items-center justify-center shadow-inner"
                style={{
                  backgroundImage: `
                    linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%),
                    linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%),
                    linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)
                  `,
                  backgroundSize: "12px 12px",
                  backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
                }}
              >
                <img
                  src={bs.logo_url}
                  alt="Logo preview"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {isAr
                  ? "معاينة الشعار الفعلي (تأكيد الشفافية)"
                  : "Active logo preview"}
              </span>
            </div>
          )}
        </div>

        {/* Favicon Upload */}
        <div className="space-y-2">
          <Label htmlFor="favicon_url">
            {isAr ? "أيقونة المتصفح (Favicon)" : "Favicon"}
          </Label>
          <div className="flex gap-2">
            <Input
              id="favicon_url"
              value={bs.favicon_url ?? ""}
              placeholder="https://… (SVG, PNG, ICO)"
              onChange={(e) => setBs("favicon_url", e.target.value)}
            />
            <input
              ref={faviconInputRef}
              type="file"
              accept="image/svg+xml,image/png,image/x-icon,image/vnd.microsoft.icon,image/webp"
              className="hidden"
              onChange={(e) =>
                e.target.files?.[0] && handleUpload(e.target.files[0], "favicon")
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => faviconInputRef.current?.click()}
              disabled={uploading === "favicon"}
              aria-label={isAr ? "رفع أيقونة المتجر" : "Upload favicon"}
            >
              <Upload className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "ملف SVG أو PNG مربع 1:1. عند تركه فارغاً يُستخدم الشعار تلقائياً."
              : "Square 1:1 SVG or PNG. Falls back to logo if omitted."}
          </p>

          {bs.favicon_url && (
            <div className="mt-2 flex items-center gap-3">
              <div className="h-8 w-8 rounded border border-border bg-muted p-1 flex items-center justify-center">
                <img
                  src={bs.favicon_url}
                  alt="Favicon preview"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {isAr ? "معاينة أيقونة المتصفح" : "Browser tab icon preview"}
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
