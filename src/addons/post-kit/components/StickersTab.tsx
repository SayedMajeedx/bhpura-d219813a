import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { deliverCreativeFile } from "@/lib/creative-export";
import { useI18n } from "@/lib/i18n";
import type { PostKit } from "../hooks/use-post-kit";
import {
  BAG_SIZES_MM,
  BAG_WORDS,
  bagLabelsPerSheet,
  renderBagLabel,
  renderBagLabelSheet,
  type BagSize,
} from "../lib/bag-label";
import { canvasToPrintPng } from "../lib/print-png";
import { printableStickerIds, renderStickerSheet, stickerPages } from "../lib/sticker-sheet";

async function savePng(
  canvas: HTMLCanvasElement | null,
  name: string,
  title: string,
  isAr: boolean,
) {
  const blob = canvas ? await canvasToPrintPng(canvas) : null;
  if (!blob) {
    toast.error(isAr ? "ما قدرنا نجهز الصورة" : "Could not prepare the image");
    return;
  }
  const delivered = await deliverCreativeFile(blob, name, "image/png", title);
  if (delivered !== "cancelled") toast.success(isAr ? "جاهز للطباعة" : "Ready to print");
}

function Preview({
  draw,
  drawKey,
  label,
  canvasRef,
  className,
}: {
  draw: (canvas: HTMLCanvasElement) => void;
  /** What the picture depends on: it is drawn again only when this changes. */
  drawKey: string;
  label: string;
  canvasRef?: (el: HTMLCanvasElement | null) => void;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const latest = useRef(draw);
  latest.current = draw;
  useEffect(() => {
    if (ref.current) latest.current(ref.current);
  }, [drawKey]);
  return (
    <canvas
      ref={(el) => {
        ref.current = el;
        canvasRef?.(el);
      }}
      role="img"
      aria-label={label}
      className={`h-auto w-full rounded-md border border-border bg-white ${className ?? ""}`}
    />
  );
}

function BagLabelSection({ kit, isAr }: { kit: PostKit; isAr: boolean }) {
  const [mm, setMm] = useState<BagSize>(80);
  const single = useRef<HTMLCanvasElement | null>(null);
  const sheet = useRef<HTMLCanvasElement | null>(null);
  const per = bagLabelsPerSheet(mm);
  const handle = "@puraline.bh";
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {isAr ? "ملصق الكيس" : "Bag label"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? `شمّوعة تقول «${BAG_WORDS}» على كل طلب. اطبعه على ورق ستيكر وقصّه.`
            : `Shammoua says “${BAG_WORDS}” on every order. Print it on sticker paper and cut it out.`}
        </p>
      </div>
      <div
        role="group"
        aria-label={isAr ? "حجم الملصق" : "Label size"}
        className="flex flex-wrap gap-2"
      >
        {BAG_SIZES_MM.map((size) => (
          <Button
            key={size}
            type="button"
            size="sm"
            variant={size === mm ? "default" : "outline"}
            aria-pressed={size === mm}
            onClick={() => setMm(size)}
          >
            {isAr ? `${size / 10} سم` : `${size / 10} cm`}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card className="min-w-0 space-y-3 p-3">
          <Preview
            draw={(c) => renderBagLabel(c, mm, handle)}
            drawKey={`label-${mm}`}
            label={isAr ? `ملصق الكيس: ${BAG_WORDS}` : `Bag label: ${BAG_WORDS}`}
            canvasRef={(el) => (single.current = el)}
          />
          <Button
            type="button"
            size="sm"
            onClick={() =>
              void savePng(
                single.current,
                `${kit.brand.slug}-bag-label-${mm}mm.png`,
                BAG_WORDS,
                isAr,
              )
            }
          >
            <Download className="size-4" />
            {isAr ? "حمّل الملصق (شفاف الحواف)" : "Save the label (clear corners)"}
          </Button>
        </Card>
        <Card className="min-w-0 space-y-3 p-3">
          <Preview
            draw={(c) => renderBagLabelSheet(c, mm, handle)}
            drawKey={`sheet-${mm}`}
            label={isAr ? "ورقة A4 من ملصق الكيس" : "A4 sheet of bag labels"}
            canvasRef={(el) => (sheet.current = el)}
            className="max-w-sm"
          />
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `${per} ملصقات في الورقة. اطبعها بالحجم الحقيقي.`
              : `${per} labels per sheet. Print at actual size.`}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              void savePng(
                sheet.current,
                `${kit.brand.slug}-bag-labels-a4-${mm}mm.png`,
                BAG_WORDS,
                isAr,
              )
            }
          >
            <Download className="size-4" />
            {isAr ? "حمّل ورقة A4" : "Save the A4 sheet"}
          </Button>
        </Card>
      </div>
    </section>
  );
}

function StickerSheetsSection({ kit, isAr }: { kit: PostKit; isAr: boolean }) {
  const [cutLine, setCutLine] = useState(false);
  const pages = stickerPages();
  const total = printableStickerIds().length;
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {isAr ? "ورقة الستيكرات" : "Sticker sheets"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? `${total} ستيكر بحافتها البيضاء، بحجم ٤٫٢ سم. اطبعها على ورق ستيكر بالحجم الحقيقي.`
            : `${total} stickers with their white edge, 4.2 cm each. Print on sticker paper at actual size.`}
        </p>
      </div>
      <label className="flex w-fit items-center gap-2 text-xs text-foreground">
        <Switch checked={cutLine} onCheckedChange={setCutLine} />
        {isAr ? "خط القص حول كل ستيكر" : "Cut line around each sticker"}
      </label>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-4">
        {pages.map((ids, i) => (
          <Card key={ids[0]} className="min-w-0 space-y-3 p-3">
            <Preview
              draw={(c) => renderStickerSheet(c, ids, cutLine)}
              drawKey={`${i}-${cutLine}`}
              label={isAr ? `ورقة ستيكرات ${i + 1}` : `Sticker sheet ${i + 1}`}
              canvasRef={(el) => (refs.current[i] = el)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void savePng(
                  refs.current[i],
                  `${kit.brand.slug}-stickers-a4-${i + 1}.png`,
                  isAr ? "ستيكرات" : "Stickers",
                  isAr,
                )
              }
            >
              <Download className="size-4" />
              {isAr ? `حمّل ورقة ${i + 1}` : `Save sheet ${i + 1}`}
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function StickersTab({ kit }: { kit: PostKit }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  return (
    <div className="space-y-8">
      <BagLabelSection kit={kit} isAr={isAr} />
      <StickerSheetsSection kit={kit} isAr={isAr} />
    </div>
  );
}
