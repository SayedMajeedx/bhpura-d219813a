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
  LABEL_DESIGNS,
  bagLabelsPerSheet,
  renderBagLabel,
  renderBagLabelSheet,
  type BagSize,
  type LabelDesign,
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

const LABEL_WORDS: Record<
  LabelDesign,
  { title: [string, string]; about: [string, string]; file: string }
> = {
  shammoua: {
    title: ["ملصق الكيس", "Bag label"],
    about: [
      `شمّوعة تقول «${BAG_WORDS}» على كل طلب. اطبعه على ورق ستيكر وقصّه.`,
      `Shammoua says “${BAG_WORDS}” on every order. Print it on sticker paper and cut it out.`,
    ],
    file: "bag-label",
  },
  fine: {
    title: ["الملصق الراقي", "Fine label"],
    about: [
      `الشعار و«${BAG_WORDS}» بخط البراند وإطار ذهبي رفيع، بدون رسومات.`,
      `Your logo and “${BAG_WORDS}” in your brand's typeface with a fine gold frame, and no drawings.`,
    ],
    file: "fine-label",
  },
};

function BagLabelSection({
  kit,
  isAr,
  design,
}: {
  kit: PostKit;
  isAr: boolean;
  design: LabelDesign;
}) {
  const words = LABEL_WORDS[design];
  const title = isAr ? words.title[0] : words.title[1];
  const [mm, setMm] = useState<BagSize>(80);
  const single = useRef<HTMLCanvasElement | null>(null);
  const sheet = useRef<HTMLCanvasElement | null>(null);
  const per = bagLabelsPerSheet(mm);
  const handle = "@puraline.bh";
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{isAr ? words.about[0] : words.about[1]}</p>
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
            draw={(c) => renderBagLabel(c, mm, handle, design, kit.phone)}
            drawKey={`label-${design}-${mm}-${kit.phone}`}
            label={`${title}: ${BAG_WORDS}`}
            canvasRef={(el) => (single.current = el)}
          />
          <Button
            type="button"
            size="sm"
            onClick={() =>
              void savePng(
                single.current,
                `${kit.brand.slug}-${words.file}-${mm}mm.png`,
                BAG_WORDS,
                isAr,
              )
            }
          >
            <Download className="size-4" />
            {isAr ? "حمّل الملصق" : "Save the label"}
          </Button>
        </Card>
        <Card className="min-w-0 space-y-3 p-3">
          <Preview
            draw={(c) => renderBagLabelSheet(c, mm, handle, design, kit.phone)}
            drawKey={`sheet-${design}-${mm}-${kit.phone}`}
            label={isAr ? `ورقة A4 من ${title}` : `A4 sheet: ${title}`}
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
                `${kit.brand.slug}-${words.file}s-a4-${mm}mm.png`,
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
  const [cutLine, setCutLine] = useState(true);
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
            ? `${total} ستيكر، كل واحد مربع بحجم ٤٫٢ سم. اطبعها على ورق ستيكر بالحجم الحقيقي وقصّها بالمسطرة.`
            : `${total} stickers, each a 4.2 cm square. Print on sticker paper at actual size and cut with a ruler.`}
        </p>
      </div>
      <label className="flex w-fit items-center gap-2 text-xs text-foreground">
        <Switch checked={cutLine} onCheckedChange={setCutLine} />
        {isAr ? "خط قص مستقيم حول كل ستيكر" : "Straight cut line around each sticker"}
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
      {LABEL_DESIGNS.map((design) => (
        <BagLabelSection key={design} kit={kit} isAr={isAr} design={design} />
      ))}
      <StickerSheetsSection kit={kit} isAr={isAr} />
    </div>
  );
}
