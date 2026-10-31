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
 * or printed, on A6 paper or on A4 at its true size with cut marks.
 */
export function CardKeepActions({
  kit,
  design,
  details,
  primary,
  lang,
  fileName = "gift-card",
}: {
  kit: CardKit;
  design: CardDesign;
  details: CardDetails;
  primary: "ar" | "en";
  lang: "ar" | "en";
  fileName?: string;
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
          ? "تعذّر حفظ صورة البطاقة. جرّب الطباعة بدلًا منها."
          : "The card's picture could not be saved. Try printing it instead.",
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
    </div>
  );
}
