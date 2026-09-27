import { ImageIcon, Instagram, Phone, Move, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FORMATS, PREVIEW_BASE_WIDTH } from "@/features/content-studio/lib/studio-content";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/** The live stage: the design at its fixed reference width, scaled to fit. */
export function StudioPreview({ studio }: { studio: ContentStudio }) {
  const {
    slug,
    isAr,
    brandNameEn,
    stageRef,
    stageViewportRef,
    videoRef,
    previewScale,
    format,
    showPrice,
    imageFit,
    businessName,
    logo,
    phone,
    instagram,
    currencySymbol,
    palette,
    editionIsAr,
    headlineIsAr,
    bodyIsAr,
    productName,
    selected,
    photo,
    isCurrentVideo,
    editionLabel,
    headline,
    body,
    exporting,
    headerScale,
    headerLogoHeight,
    headerPosY,
    headerPlateStyle,
    headerPlateColor,
    headerTextColor,
    headerBadgeText,
    headerShowBadge,
    isDraggingHeader,
    handleHeaderPointerDown,
  } = studio;
  return (
    <div
      id="studio-preview"
      className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl sm:rounded-[28px] border border-border-strong bg-muted/30 p-3 sm:p-7 xl:sticky xl:top-4 self-start shadow-xs"
    >
      <div className="mb-3 sm:mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-xs font-bold text-muted-foreground",
              !isAr && "uppercase tracking-[.15em]",
            )}
          >
            {isAr ? "معاينة مباشرة" : "Live preview"}
          </p>
          <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold flex items-center gap-1 text-foreground">
            <span dir="ltr" className="font-mono tabular-nums">
              {FORMATS[format].width} × {FORMATS[format].height} px
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              document.getElementById("studio-controls")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="xl:hidden h-8 px-2.5 gap-1.5 text-xs font-semibold rounded-xl text-foreground border-border bg-background hover:bg-muted cursor-pointer"
          >
            <Sliders className="size-3.5" />
            <span>{isAr ? "التعديل" : "Edit"}</span>
          </Button>
          <span className="grid size-8 place-items-center rounded-xl bg-background/80 border border-border-subtle text-muted-foreground">
            <ImageIcon className="size-4" />
          </span>
        </div>
      </div>
      <div
        ref={stageViewportRef}
        dir="ltr"
        className="mx-auto w-full max-w-[570px] overflow-hidden rounded-[22px] shadow-2xl relative"
        style={{
          // Reserves exactly the scaled-down footprint of the fixed-width
          // stage below, so shrinking it on a narrow screen doesn't leave
          // empty space (transform never affects layout/reserved space).
          height: `${(
            PREVIEW_BASE_WIDTH *
            (FORMATS[format].height / FORMATS[format].width) *
            previewScale
          ).toFixed(2)}px`,
        }}
      >
        <div
          ref={stageRef}
          className={cn("relative isolate overflow-hidden shrink-0", FORMATS[format].ratio)}
          style={{
            background: palette.bg,
            color: palette.ink,
            // Fixed reference width — see PREVIEW_BASE_WIDTH — then
            // visually scaled to fit. Never touches offsetWidth, so the
            // html2canvas export scale below is unaffected either way.
            width: `${PREVIEW_BASE_WIDTH}px`,
            transform: `scale(${previewScale})`,
            transformOrigin: "top left",
          }}
        >
          {photo ? (
            isCurrentVideo ? (
              <video
                ref={videoRef}
                src={photo}
                crossOrigin="anonymous"
                autoPlay
                loop={!exporting}
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
                <span className="flex items-center gap-1 text-xs font-bold bg-black/85 text-white px-2.5 py-0.5 rounded-full shadow-md whitespace-nowrap">
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
                      headerTextColor === "dark" ? "bg-foreground/30" : "bg-white/40",
                    )}
                  />
                  <span
                    dir="auto"
                    lang={editionIsAr ? "ar" : "en"}
                    className={cn(
                      "font-semibold truncate pointer-events-none",
                      editionIsAr ? "text-[12px] sm:text-sm" : "text-xs uppercase tracking-[.22em]",
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
                  "rounded-full px-2.5 py-0.5 sm:px-3 sm:py-1 text-xs font-bold uppercase tracking-[.16em] whitespace-nowrap pointer-events-none shrink-0",
                  headerTextColor === "dark"
                    ? "border border-foreground/30 bg-black/5 text-foreground"
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
              isAr ? "right-[6%] text-end" : "left-[6%] text-start",
            )}
            style={{
              background: palette.panel,
              direction: isAr ? "rtl" : "ltr",
              textAlign: isAr ? "right" : "left",
            }}
          >
            <div className="mb-[2.25%] flex items-center gap-2">
              <span className="h-px w-6 bg-current opacity-45" />
              <p className="text-xs font-black opacity-65">{productName}</p>
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
              className="mt-[2.5%] max-w-[94%] text-xs font-medium leading-[1.65] opacity-80 sm:text-sm"
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
            className="absolute inset-x-[6%] bottom-[2.2%] flex items-center justify-between gap-3 text-xs font-semibold tracking-wide text-white"
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
  );
}
