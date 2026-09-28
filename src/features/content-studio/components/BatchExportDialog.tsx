import { Image as ImageIcon, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BATCH_MAX } from "@/features/content-studio/lib/batch";
import { FORMATS } from "@/features/content-studio/lib/studio-content";
import { ProductTileGrid } from "@/features/content-studio/components/ProductTileGrid";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/**
 * Runs the chosen template across several products: pick up to twelve,
 * choose stills or videos, and get them all at once.
 */
export function BatchExportDialog({ studio }: { studio: ContentStudio }) {
  const {
    isAr,
    products,
    activeTemplate,
    format,
    mp4Supported,
    batchOpen,
    setBatchOpen,
    batchPicks,
    setBatchPicks,
    toggleBatchProduct,
    batchKind,
    setBatchKind,
    batchRunning,
    batchDone,
    runBatch,
    cancelBatch,
  } = studio;
  if (!activeTemplate) return null;
  const full = batchPicks.length >= BATCH_MAX;
  const templateName = isAr ? activeTemplate.name.ar : activeTemplate.name.en;
  const kinds = [
    {
      value: "png" as const,
      label: isAr ? "صور ثابتة (PNG)" : "Still images (PNG)",
      note: isAr ? "سريعة" : "Quick",
      Icon: ImageIcon,
      disabled: false,
    },
    {
      value: "mp4" as const,
      label: isAr ? "فيديوهات (MP4)" : "Videos (MP4)",
      note: isAr ? "بضع ثوانٍ لكل منتج" : "A few seconds each",
      Icon: Video,
      disabled: mp4Supported === false,
    },
  ];

  return (
    <Dialog open={batchOpen} onOpenChange={(open) => !batchRunning && setBatchOpen(open)}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>{isAr ? "تصدير عدة منتجات" : "Export several products"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? `قالب «${templateName}» لكل منتج تختاره، باسمه وسعره وصورته، بنفس الشكل والمقاس.`
              : `${templateName} for each product you pick, with its own name, price and photo, in this look and format.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <span id="studio-batch-label" className="text-xs font-bold text-foreground">
              {isAr ? "المنتجات" : "Products"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={batchRunning}
                onClick={() =>
                  setBatchPicks(products.slice(0, BATCH_MAX).map((product) => product.id))
                }
              >
                {isAr ? `أول ${BATCH_MAX}` : `First ${BATCH_MAX}`}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={batchRunning || batchPicks.length === 0}
                onClick={() => setBatchPicks([])}
              >
                {isAr ? "مسح" : "Clear"}
              </Button>
              <span
                dir="ltr"
                className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary"
              >
                {batchPicks.length} / {BATCH_MAX}
              </span>
            </div>
          </div>
          <ProductTileGrid
            products={products}
            pickedIds={batchPicks}
            isAr={isAr}
            labelledBy="studio-batch-label"
            isLocked={(picked) => batchRunning || (!picked && full)}
            onToggle={toggleBatchProduct}
          />

          <div
            role="radiogroup"
            aria-label={isAr ? "نوع الملفات" : "File type"}
            className="grid grid-cols-2 gap-2"
          >
            {kinds.map(({ value, label, note, Icon, disabled }) => {
              const selected = batchKind === value;
              return (
                <Button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  variant="chip"
                  disabled={disabled || batchRunning}
                  onClick={() => setBatchKind(value)}
                  className={cn(
                    "h-auto justify-start gap-2.5 rounded-xl border-border px-3 py-2.5 text-start",
                    selected && "border-primary bg-primary/10 text-foreground hover:bg-primary/10",
                  )}
                >
                  <Icon className="size-4 text-primary" aria-hidden="true" />
                  <span className="flex flex-col">
                    <span className="text-xs font-semibold">{label}</span>
                    <span className="text-xs text-muted-foreground">{note}</span>
                  </span>
                </Button>
              );
            })}
          </div>

          {batchRunning ? (
            <div className="flex items-center gap-2">
              <div
                role="progressbar"
                aria-label={isAr ? "تقدم التصدير" : "Export progress"}
                aria-valuemin={0}
                aria-valuemax={batchPicks.length}
                aria-valuenow={batchDone}
                className="h-11 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-muted"
              >
                <div
                  className="flex h-full items-center whitespace-nowrap bg-primary px-3 text-xs font-semibold text-primary-foreground transition-[width] duration-300"
                  style={{ width: `${Math.max(18, (batchDone / batchPicks.length) * 100)}%` }}
                >
                  {isAr
                    ? `${batchDone} من ${batchPicks.length}`
                    : `${batchDone} of ${batchPicks.length}`}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={cancelBatch}
                aria-label={isAr ? "إلغاء التصدير" : "Cancel export"}
                className="size-11 rounded-xl"
              >
                <X />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              className="h-11 w-full rounded-xl font-semibold"
              disabled={batchPicks.length === 0}
              onClick={() => void runBatch()}
            >
              {isAr
                ? `تصدير ${batchPicks.length} ${batchPicks.length === 1 ? "تصميم" : "تصاميم"}`
                : `Export ${batchPicks.length} ${batchPicks.length === 1 ? "creative" : "creatives"}`}
              <span className="font-normal opacity-80">
                · {FORMATS[format][isAr ? "ar" : "en"]}
              </span>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
