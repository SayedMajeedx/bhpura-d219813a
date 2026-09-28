import { useRef, useState } from "react";
import { toast } from "sonner";
import { creativeFileName, deliverCreativeFiles } from "@/lib/creative-export";
import { describeVariantAxes } from "@/lib/variant-axes";
import type { useInventoryAxisDefaults } from "@/features/inventory/hooks/use-inventory-axis-defaults";
import { exportTemplateMp4, exportTemplatePng } from "@/features/content-studio/engine/export";
import { loadStudioFonts } from "@/features/content-studio/engine/fonts";
import type { StudioTemplate } from "@/features/content-studio/engine/scene";
import { FORMATS, firstImage, type Product } from "@/features/content-studio/lib/studio-content";
import { studioSale } from "@/features/content-studio/lib/sale-price";
import { optionRun } from "@/features/content-studio/lib/option-run";
import {
  BATCH_TEMPLATES,
  batchSceneFields,
  toggleBatchPick,
} from "@/features/content-studio/lib/batch";
import type { useTemplateScene } from "@/features/content-studio/hooks/use-template-scene";
import type { useStudioProduct } from "@/features/content-studio/hooks/use-studio-product";

type Variants = NonNullable<ReturnType<typeof useStudioProduct>["variantsQ"]["data"]>;

/** How long a batch waits for one photo before drawing that product without it. */
const IMAGE_TIMEOUT_MS = 20_000;

/**
 * An image ready for the canvas (CORS, so the export is not blocked), or null
 * if it fails or takes too long, so one stuck photo never stalls the batch.
 */
function loadImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Runs the chosen template across several products: each product's own copy,
 * price, photo and options, in the studio's look and format, as stills or
 * videos, handed over together (the share sheet, or one ZIP).
 */
export function useBatchExport({
  template,
  buildScene,
  products,
  variants,
  axisDefaults,
  leadId,
  format,
  isAr,
  showPrice,
  currencySymbol,
  brandSlugClean,
  businessName,
}: {
  template: StudioTemplate | null;
  buildScene: ReturnType<typeof useTemplateScene>["buildScene"];
  products: readonly Product[];
  variants: Variants;
  axisDefaults: ReturnType<typeof useInventoryAxisDefaults>;
  leadId: string | undefined;
  format: keyof typeof FORMATS;
  isAr: boolean;
  showPrice: boolean;
  currencySymbol: string;
  brandSlugClean: string;
  businessName: string;
}) {
  const [batchOpen, setBatchOpenState] = useState(false);
  const [batchPicks, setBatchPicks] = useState<readonly string[]>([]);
  const [batchKind, setBatchKind] = useState<"png" | "mp4">("png");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchDone, setBatchDone] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const batchable = Boolean(template && BATCH_TEMPLATES.includes(template.id));

  // Opening starts from the product on screen.
  const setBatchOpen = (open: boolean) => {
    if (open && batchPicks.length === 0 && leadId) setBatchPicks([leadId]);
    setBatchOpenState(open);
  };
  const toggleBatchProduct = (id: string) =>
    setBatchPicks((current) => toggleBatchPick(current, id));

  const runBatch = async () => {
    if (!template || batchPicks.length === 0) return;
    const lang = isAr ? "ar" : "en";
    const { width, height } = FORMATS[format];
    const picked = batchPicks
      .map((id) => products.find((product) => product.id === id))
      .filter((product): product is Product => Boolean(product));
    const controller = new AbortController();
    abortRef.current = controller;
    setBatchRunning(true);
    setBatchDone(0);
    try {
      await loadStudioFonts();
      const files: Array<{ name: string; blob: Blob; type: string }> = [];
      for (const product of picked) {
        if (controller.signal.aborted) throw new DOMException("Export cancelled", "AbortError");
        const own = variants.filter((variant) => variant.product_id === product.id);
        const run = optionRun(
          describeVariantAxes({ variants: own, addonDefaults: axisDefaults, lang }),
          own,
          lang,
        );
        const [media, stopMedia] = await Promise.all([
          loadImage(firstImage(product)),
          Promise.all((run?.stops ?? []).map((stop) => loadImage(stop.imageUrl))),
        ]);
        const scene = {
          ...buildScene(width, height, media),
          ...batchSceneFields({
            product,
            lang,
            showPrice,
            currencySymbol,
            sale: studioSale(own, null),
            run,
            media,
            stopMedia,
          }),
        };
        const blob =
          batchKind === "mp4"
            ? await exportTemplateMp4({ template, scene, signal: controller.signal })
            : await exportTemplatePng({ template, scene });
        files.push({
          name: creativeFileName(brandSlugClean, product.name, format, batchKind),
          blob,
          type: batchKind === "mp4" ? "video/mp4" : "image/png",
        });
        setBatchDone(files.length);
      }
      const delivered = await deliverCreativeFiles(
        files,
        `${brandSlugClean}-${template.id}-${format}.zip`,
        businessName,
      );
      if (delivered !== "cancelled") {
        toast.success(
          delivered === "shared"
            ? isAr
              ? "التصاميم جاهزة للمشاركة"
              : "Creatives ready to share"
            : isAr
              ? `تم تنزيل ${files.length} تصاميم في ملف مضغوط`
              : `Downloaded ${files.length} creatives as a ZIP`,
        );
        setBatchOpenState(false);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.info(isAr ? "تم إلغاء التصدير" : "Export cancelled");
      } else {
        console.error("Batch export failed", error);
        toast.error(
          isAr
            ? "تعذر تصدير الدفعة. تحقق من صور المنتجات."
            : "Could not export the batch. Check the product images.",
        );
      }
    } finally {
      abortRef.current = null;
      setBatchRunning(false);
      setBatchDone(0);
    }
  };

  return {
    batchable,
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
    cancelBatch: () => abortRef.current?.abort(),
  };
}
