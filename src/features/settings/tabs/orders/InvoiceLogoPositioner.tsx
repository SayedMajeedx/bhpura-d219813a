import { Rnd } from "react-rnd";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const LOGO_CANVAS_W = 600;
const LOGO_CANVAS_H = 220;

/**
 * Drag-and-resize logo positioner for the invoice header, plus a live mini preview
 * of the invoice header using the current colours, fonts and visibility flags.
 * Numeric inputs stay available for precise adjustments.
 */
export function InvoiceLogoPositioner() {
  const { lang, t } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;
  const previewFont =
    bs.font_family === "Custom (uploaded)" && bs.font_url
      ? "'CustomInvoiceFont', sans-serif"
      : `"${bs.font_family || "Cormorant Garamond"}", sans-serif`;

  const numericFields: Array<{
    key: "logo_x" | "logo_y" | "logo_width" | "logo_height";
    ar: string;
    en: string;
  }> = [
    { key: "logo_x", ar: "إزاحة أفقية (X)", en: "Offset X" },
    { key: "logo_y", ar: "إزاحة رأسية (Y)", en: "Offset Y" },
    { key: "logo_width", ar: "العرض", en: "Width" },
    { key: "logo_height", ar: "الارتفاع", en: "Height" },
  ];

  return (
    <div className="space-y-4 pt-2 border-t border-border">
      {bs.font_url && (
        <style>{`@font-face { font-family: 'CustomInvoiceFont'; src: url('${bs.font_url}'); font-display: swap; }`}</style>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label className="text-xs font-semibold">
            {isAr ? "موضع وحجم الشعار في رأس الفاتورة" : "Invoice logo position & size"}
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? "اسحب الشعار لتغيير موضعه واسحب الزوايا لتغيير حجمه. تنعكس الأبعاد على كل الفواتير."
              : "Drag the logo to reposition it and drag the corners to resize. Applies to all invoices."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 h-8 text-xs"
          onClick={() => setBs({ logo_x: 0, logo_y: 0, logo_width: 160, logo_height: 64 })}
        >
          {isAr ? "إعادة ضبط" : "Reset"}
        </Button>
      </div>

      {bs.logo_url ? (
        <div
          className="w-full overflow-x-auto rounded-md pb-2"
          tabIndex={0}
          aria-label={isAr ? "معاينة موضع شعار الفاتورة" : "Invoice logo position preview"}
        >
          <div
            className="relative mx-auto border border-dashed border-border rounded-md overflow-hidden shadow-inner"
            style={{
              width: LOGO_CANVAS_W,
              height: LOGO_CANVAS_H,
              backgroundColor: bs.background_color || "#ffffff",
            }}
          >
            <Rnd
              size={{
                width: Math.max(24, bs.logo_width || 160),
                height: Math.max(24, bs.logo_height || 64),
              }}
              position={{ x: Number(bs.logo_x) || 0, y: Number(bs.logo_y) || 0 }}
              onDragStop={(_e, d) => setBs({ logo_x: Math.round(d.x), logo_y: Math.round(d.y) })}
              onResizeStop={(_e, _dir, ref, _delta, pos) => {
                const w = Math.max(24, parseInt(ref.style.width, 10));
                const h = Math.max(24, parseInt(ref.style.height, 10));
                setBs({
                  logo_width: w,
                  logo_height: h,
                  logo_x: Math.round(pos.x),
                  logo_y: Math.round(pos.y),
                });
              }}
              lockAspectRatio
              bounds="parent"
              className="border border-dashed border-primary/60 hover:border-primary rounded cursor-move"
            >
              <img
                src={bs.logo_url}
                alt=""
                draggable={false}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  pointerEvents: "none",
                }}
              />
            </Rnd>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border p-3">
          {isAr
            ? "ارفع شعار المتجر من تبويب الهوية لضبط موضعه في الفاتورة."
            : "Upload the store logo from the Identity tab to position it on the invoice."}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {numericFields.map((field) => (
          <div key={field.key}>
            <Label className="text-xs text-muted-foreground">{isAr ? field.ar : field.en}</Label>
            <Input
              type="number"
              className="mt-1 text-xs h-8 font-mono"
              value={bs[field.key] ?? 0}
              onChange={(e) => setBs({ [field.key]: Number(e.target.value) || 0 })}
            />
          </div>
        ))}
      </div>

      {/* Live header preview */}
      <div
        className="rounded-lg border border-border p-5 shadow-xs space-y-3"
        style={{
          backgroundColor: bs.background_color || "#ffffff",
          color: bs.text_color || "#1c1917",
          fontFamily: previewFont,
          fontSize: `${bs.font_size || 14}px`,
        }}
      >
        <div style={{ borderTop: `4px solid ${bs.primary_color || "#111111"}` }} />
        <div className="flex items-start justify-between gap-4">
          <div>
            {bs.logo_url && (
              <img
                src={bs.logo_url}
                alt=""
                style={{
                  width: bs.logo_width || "auto",
                  height: bs.logo_height || 64,
                  objectFit: "contain",
                  marginBottom: 8,
                }}
              />
            )}
            {(bs.invoice_show_business_name ?? true) && (
              <div
                style={{
                  color: bs.primary_color || "#111111",
                  fontSize: `${(bs.font_size || 14) * 1.4}px`,
                  fontWeight: 700,
                }}
              >
                {bs.business_name || t("settings.businessName")}
              </div>
            )}
            <div
              className="text-xs opacity-80 mt-1"
              style={{ fontFamily: `"${bs.invoice_arabic_font_family || "Cairo"}", sans-serif` }}
            >
              {bs.invoice_title_ar || "فاتورة ضريبية"} · {bs.invoice_title_en || "Tax Invoice"}
            </div>
          </div>
          <div className="text-end">
            <span
              className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: bs.invoice_status_paid_color || "#16a34a" }}
            >
              {isAr ? "مدفوع" : "PAID"}
            </span>
            <p className="text-xs opacity-70 mt-1">#INV-1001</p>
          </div>
        </div>
        <div
          className="grid grid-cols-3 rounded px-2 py-1 text-xs font-semibold"
          style={{
            backgroundColor: bs.invoice_table_header_bg || "#f8fafc",
            color: bs.invoice_table_header_fg || "#111111",
          }}
        >
          <span>{isAr ? "المنتج" : "Item"}</span>
          <span className="text-center">{isAr ? "الكمية" : "Qty"}</span>
          <span className="text-end">{isAr ? "الإجمالي" : "Total"}</span>
        </div>
        <p className="text-xs opacity-75">{t("settings.previewText")}</p>
      </div>
    </div>
  );
}
