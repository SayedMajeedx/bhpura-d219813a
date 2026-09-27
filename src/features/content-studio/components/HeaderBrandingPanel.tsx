import { Palette, Move, Sliders, RotateCcw, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/** The logo bar's label, badge, plate, contrast, position and size. */
export function HeaderBrandingPanel({ studio }: { studio: ContentStudio }) {
  const {
    isAr,
    palette,
    editionLabel,
    setEditionLabel,
    defaultEditionLabel,
    headerScale,
    setHeaderScale,
    headerLogoHeight,
    setHeaderLogoHeight,
    headerPosY,
    setHeaderPosY,
    headerPlateStyle,
    setHeaderPlateStyle,
    headerPlateColor,
    setHeaderPlateColor,
    headerTextColor,
    setHeaderTextColor,
    headerBadgeText,
    setHeaderBadgeText,
    headerShowBadge,
    setHeaderShowBadge,
    resetHeaderLayout,
  } = studio;
  return (
    <div className="rounded-2xl border border-border-strong bg-muted/20 p-3.5 sm:p-5 space-y-4 sm:space-y-5 shadow-2xs min-w-0">
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
            <Sliders className="size-3.5" />
          </span>
          <div>
            <h3 className="text-xs font-bold text-foreground">
              {isAr ? "شريط الشعار والترويسة" : "Header & Branding Bar"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAr ? "تخصيص الموضع والحجم وخلفية الشعار" : "Position, resize & backdrop plate"}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={resetHeaderLayout}
          className="h-7 gap-1 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-background/80"
          title={isAr ? "استعادة الموضع والحجم الافتراضي" : "Reset layout"}
        >
          <RotateCcw className="size-3" />
          <span>{isAr ? "إعادة ضبط" : "Reset"}</span>
        </Button>
      </div>

      {/* Text Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between h-6">
            <Label
              htmlFor="studio-edition-label"
              className="text-xs font-bold text-foreground leading-none"
            >
              {isAr ? "العبارة بجانب الشعار" : "Edition label"}
            </Label>
            <span
              dir="ltr"
              className="font-mono text-xs text-muted-foreground tabular-nums leading-none"
            >
              {editionLabel.length}/28
            </span>
          </div>
          <Input
            id="studio-edition-label"
            value={editionLabel}
            maxLength={28}
            onChange={(event) => setEditionLabel(event.target.value)}
            className="h-10 rounded-xl text-xs bg-background"
            placeholder={defaultEditionLabel}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between h-6">
            <Label
              htmlFor="studio-badge-text"
              className="text-xs font-bold text-foreground leading-none"
            >
              {isAr ? "شارة الموقع / الدولة" : "Location badge"}
            </Label>
            <button
              type="button"
              onClick={() => setHeaderShowBadge(!headerShowBadge)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md border transition-all cursor-pointer leading-none",
                headerShowBadge
                  ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border bg-muted/50 text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full shrink-0",
                  headerShowBadge ? "bg-primary" : "bg-muted-foreground/40",
                )}
              />
              <span>
                {headerShowBadge ? (isAr ? "مفعّلة" : "Visible") : isAr ? "مخفية" : "Hidden"}
              </span>
            </button>
          </div>
          <Input
            id="studio-badge-text"
            value={headerBadgeText}
            maxLength={16}
            disabled={!headerShowBadge}
            onChange={(event) => setHeaderBadgeText(event.target.value)}
            className="h-10 rounded-xl text-xs bg-background disabled:opacity-40 disabled:cursor-not-allowed"
            placeholder="Bahrain"
          />
        </div>
      </div>

      {/* Backdrop Plate Style (None / Glassmorphic / Solid) */}
      <div className="space-y-2">
        <Label className="text-xs font-bold text-foreground">
          {isAr ? "خلفية شريط الشعار (لزيادة الوضوح)" : "Header backdrop plate"}
        </Label>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setHeaderPlateStyle("none")}
            className={cn(
              "rounded-xl border p-2 text-center text-xs font-bold transition-all cursor-pointer truncate min-w-0",
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
              "rounded-xl border p-2 text-center text-xs font-bold transition-all cursor-pointer truncate min-w-0",
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
              "rounded-xl border p-2 text-center text-xs font-bold transition-all cursor-pointer truncate min-w-0",
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
          <div className="space-y-3 rounded-xl border border-border-subtle bg-background/70 p-3 pt-2.5">
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5 font-medium">
                <span>{isAr ? "لون الخلفية" : "Plate color"}</span>
                <span dir="ltr" className="font-mono text-xs tabular-nums">
                  {headerPlateColor}
                </span>
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
                        "h-7 px-2.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer",
                        headerPlateColor === "rgba(0, 0, 0, 0.52)"
                          ? "border-primary ring-1 ring-primary"
                          : "border-border",
                      )}
                      style={{ background: "rgba(0, 0, 0, 0.52)", color: "#fff" }}
                    >
                      <Moon className="size-2.5" />
                      <span>{isAr ? "زجاج داكن" : "Dark glass"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHeaderPlateColor("rgba(255, 255, 255, 0.78)");
                        setHeaderTextColor("dark");
                      }}
                      className={cn(
                        "h-7 px-2.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer",
                        headerPlateColor === "rgba(255, 255, 255, 0.78)"
                          ? "border-primary ring-1 ring-primary"
                          : "border-border",
                      )}
                      style={{ background: "rgba(255, 255, 255, 0.78)", color: "#111" }}
                    >
                      <Sun className="size-2.5" />
                      <span>{isAr ? "زجاج فاتح" : "Light glass"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHeaderPlateColor("rgba(51, 10, 10, 0.65)");
                        setHeaderTextColor("white");
                      }}
                      className={cn(
                        "h-7 px-2.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer",
                        headerPlateColor === "rgba(51, 10, 10, 0.65)"
                          ? "border-primary ring-1 ring-primary"
                          : "border-border",
                      )}
                      style={{ background: "rgba(51, 10, 10, 0.65)", color: "#fff" }}
                    >
                      <Palette className="size-2.5" />
                      <span>{isAr ? "براند" : "Brand"}</span>
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
                        "h-7 px-2.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer",
                        headerPlateColor === "#111111"
                          ? "border-primary ring-1 ring-primary"
                          : "border-border",
                      )}
                      style={{ background: "#111111", color: "#fff" }}
                    >
                      <span>{isAr ? "أسود" : "Black"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHeaderPlateColor("#ffffff");
                        setHeaderTextColor("dark");
                      }}
                      className={cn(
                        "h-7 px-2.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer",
                        headerPlateColor === "#ffffff"
                          ? "border-primary ring-1 ring-primary"
                          : "border-border",
                      )}
                      style={{ background: "#ffffff", color: "#111" }}
                    >
                      <span>{isAr ? "أبيض" : "White"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHeaderPlateColor(palette.ink);
                        setHeaderTextColor("white");
                      }}
                      className={cn(
                        "h-7 px-2.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer",
                        headerPlateColor === palette.ink
                          ? "border-primary ring-1 ring-primary"
                          : "border-border",
                      )}
                      style={{ background: palette.ink, color: palette.bg }}
                    >
                      <Palette className="size-2.5" />
                      <span>{isAr ? "لون النمط" : "Theme ink"}</span>
                    </button>
                  </>
                )}
                <label className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border bg-background cursor-pointer text-xs text-muted-foreground hover:text-foreground">
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
            <div className="flex items-center justify-between border-t border-border-subtle pt-2 text-xs">
              <span className="text-xs font-semibold text-muted-foreground">
                {isAr ? "تباين الشعار والنصوص" : "Content contrast"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setHeaderTextColor("white")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer",
                    headerTextColor === "white"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  ⚪ {isAr ? "أبيض" : "Light"}
                </button>
                <button
                  type="button"
                  onClick={() => setHeaderTextColor("dark")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer",
                    headerTextColor === "dark"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
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
      <div className="space-y-3.5 border-t border-border-subtle pt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold flex items-center gap-1.5 text-foreground text-xs">
            <Move className="size-3.5 text-primary" />
            <span>{isAr ? "الموضع والارتفاع" : "Position & Sizing"}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {isAr ? "اسحب بالماوس مباشرة أو اضبط هنا" : "Drag on canvas or adjust"}
          </span>
        </div>

        {/* Vertical Position (Y) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-xs font-medium text-muted-foreground">
              {isAr ? "الموضع العمودي (من الأعلى)" : "Vertical position (Y)"}
            </span>
            <span
              dir="ltr"
              className="font-mono text-xs font-bold tabular-nums px-2 py-0.5 rounded-md bg-background border border-border-strong text-foreground shadow-2xs"
            >
              {headerPosY}%
            </span>
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
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-xs font-medium text-muted-foreground">
              {isAr ? "ارتفاع الشعار" : "Logo height"}
            </span>
            <span
              dir="ltr"
              className="font-mono text-xs font-bold tabular-nums px-2 py-0.5 rounded-md bg-background border border-border-strong text-foreground shadow-2xs"
            >
              {headerLogoHeight}px
            </span>
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
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-xs font-medium text-muted-foreground">
              {isAr ? "مقياس الترويسة الكاملة" : "Overall header scale"}
            </span>
            <span
              dir="ltr"
              className="font-mono text-xs font-bold tabular-nums px-2 py-0.5 rounded-md bg-background border border-border-strong text-foreground shadow-2xs"
            >
              {Math.round(headerScale * 100)}%
            </span>
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
  );
}
