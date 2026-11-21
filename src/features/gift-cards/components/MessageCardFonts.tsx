import type { CardFontChoices } from "@/lib/data/gift-cards/designs";
import { GIFT_MESSAGE_CARD_DESIGN } from "@/lib/gift-order";
import { GiftCardFace } from "@/features/gift-card-design/components/GiftCardFace";
import type { CardKit } from "@/features/gift-card-design/hooks/use-card-kit";
import { DEFAULT_DESIGN } from "@/features/gift-card-design/lib/design";
import { CardFontFields, type FontLibraryProps } from "./CardBrandControls";

/**
 * A gift message card's fonts (the card tucked into a gift order): its own choice in each
 * language, starting as the gift cards' font, for who it is for, the message and who it is from.
 * The back beside them shows a message written on two lines, set as it will print.
 */
export function MessageCardFonts({
  kit,
  lang,
  value,
  onChange,
  giftFonts,
  fontLibrary,
}: {
  /** The kit with the choices being made, for the preview. */
  kit: CardKit;
  lang: "ar" | "en";
  value: CardFontChoices;
  onChange: (value: CardFontChoices) => void;
  /** The gift cards' fonts, which a message card takes until it chooses its own. */
  giftFonts: CardFontChoices;
  fontLibrary: FontLibraryProps;
}) {
  const isAr = lang === "ar";
  return (
    <div className="space-y-4 rounded-lg border border-border p-3">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <CardFontFields
          lang={lang}
          heading={isAr ? "خطوط بطاقة الإهداء" : "Gift message card fonts"}
          description={
            isAr
              ? "البطاقة التي تُرفق مع طلب الهدية: اسم المُهدى إليه والرسالة واسم المرسل."
              : "The card tucked into a gift order: who it is for, the message and who it is from."
          }
          storeName={kit.storeName}
          value={value}
          onChange={onChange}
          base="gift"
          inherited={giftFonts}
          fontLibrary={fontLibrary}
        />
        <div className="sm:w-32">
          <GiftCardFace
            kit={kit}
            design={{
              ...DEFAULT_DESIGN,
              design: GIFT_MESSAGE_CARD_DESIGN,
              language: lang,
              from: isAr ? "سارة" : "Sara",
            }}
            details={{
              amount: null,
              code: null,
              to: isAr ? "نورة" : "Noura",
              message: isAr
                ? "عيد ميلاد سعيد\nهدية بسيطة من القلب"
                : "Happy birthday\nA little something from the heart",
              expiresOn: null,
              purpose: "message",
            }}
            primary={lang}
            face="back"
            label={isAr ? "معاينة بطاقة الإهداء" : "Gift message card preview"}
            className="mx-auto w-32 shadow-sm"
          />
        </div>
      </div>
    </div>
  );
}
