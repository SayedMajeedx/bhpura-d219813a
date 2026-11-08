import { useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cardBack } from "../lib/back";
import { cardFront } from "../lib/front";
import { cardSize } from "../lib/geometry";
import { cardPng, loadCardFonts, pageMeasure } from "../lib/canvas";
import { cardContent, type CardDetails } from "../lib/content";
import type { CardDesign } from "../lib/design";
import { cardPrintHtml, type PrintFormat } from "../lib/print";
import type { CardKit } from "../hooks/use-card-kit";

/**
 * Keeping a card: its two faces as pictures (to send on WhatsApp, shared from a phone or saved),
 * and, for the store's staff only (`printing`), printed: on one side of A4 to fold, glue and cut
 * (any printer), on A6 paper, or on A4 at its true size with cut marks. A buyer never prints a
 * card: the store prints it and delivers it (the owner's decision of 2026-11-08).
 */
export function CardKeepActions({
  kit,
  design,
  details,
  primary,
  lang,
  fileName = "gift-card",
  printing = false,
}: {
  kit: CardKit;
  design: CardDesign;
  details: CardDetails;
  primary: "ar" | "en";
  lang: "ar" | "en";
  fileName?: string;
  /** The store's staff print the card; a buyer only saves its picture. */
  printing?: boolean;
}) {
  const isAr = lang === "ar";
  const [saving, setSaving] = useState(false);

  const faces = async () => {
    await loadCardFonts(kit.fonts);
    const measure = pageMeasure();
    const content = cardContent(kit, design.photo, details, primary);
    return {
      front: cardFront(design, content, kit.colours, measure),
      back: cardBack(design, content, kit.colours, measure),
      size: cardSize(design.orientation),
    };
  };

  const save = async () => {
    setSaving(true);
    try {
      const { front, back, size } = await faces();
      const files = [
        new File([await cardPng(front, size, kit.fonts)], `${fileName}-front.png`, {
          type: "image/png",
        }),
        new File([await cardPng(back, size, kit.fonts)], `${fileName}-back.png`, {
          type: "image/png",
        }),
      ];
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files }).catch(() => undefined);
        return;
      }
      for (const file of files) {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch {
      toast.error(
        isAr
          ? "تعذّر حفظ صورة البطاقة. حاول مرة أخرى."
          : "The card's picture could not be saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const print = async (format: PrintFormat) => {
    const sheet = window.open("", "_blank", "width=900,height=1000");
    if (!sheet) {
      toast.error(isAr ? "اسمح بالنوافذ المنبثقة للطباعة." : "Allow pop-ups to print the card.");
      return;
    }
    const { front, back, size } = await faces();
    sheet.document.open();
    sheet.document.write(
      cardPrintHtml({
        front,
        back,
        size,
        format,
        lang,
        origin: window.location.origin,
        fonts: kit.fonts,
      }),
    );
    sheet.document.close();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={save}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-4" aria-hidden="true" />
          )}
          {isAr ? "حفظ صورة البطاقة" : "Save the card"}
        </Button>
        {printing && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => print("fold")}
            >
              <Printer className="size-4" aria-hidden="true" />
              {isAr ? "طباعة للطي واللصق" : "Print to fold and glue"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => print("a6")}
            >
              <Printer className="size-4" aria-hidden="true" />
              {isAr ? "طباعة على ورق A6" : "Print on A6"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => print("a4")}
            >
              <Printer className="size-4" aria-hidden="true" />
              {isAr ? "طباعة على A4 للقص" : "Print on A4 to cut out"}
            </Button>
          </>
        )}
      </div>
      {printing && (
        <p className="text-center text-xs text-muted-foreground">
          {isAr
            ? "لأي طابعة: وجه واحد من A4 يُطوى ويُلصق ويُقص، فتطلع بطاقة بوجهين. التصاميم البيضاء والبيج أوضح على الطابعات المنزلية."
            : "For any printer: one side of A4, folded, glued and cut into a two-sided card. White and nude designs print cleanest at home."}
        </p>
      )}
    </div>
  );
}
