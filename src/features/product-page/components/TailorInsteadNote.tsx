import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useStorefront } from "@/lib/storefront-context";
import type { useVocabulary } from "@/hooks/use-vocabulary";

/**
 * What is chosen has no ready piece, and the store can make it: the best moment to say so, in one
 * tap, with how long it takes. The page once struck the choices through and left a button that
 * answered "please select a ready size".
 */
export function TailorInsteadNote({
  lang,
  onTailor,
  t,
  tailoringTime,
  vocabulary,
}: {
  lang: ReturnType<typeof useStorefront>["lang"];
  onTailor: () => void;
  t: ReturnType<typeof useStorefront>["t"];
  tailoringTime: string | null;
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
}) {
  const word = vocabulary.custom_sizing?.[lang] || t("مقاس مخصص", "Custom size");
  return (
    <div role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
      <p className="text-sm font-medium text-foreground">
        {t(
          "هذا الاختيار غير متوفر جاهز، ويمكن طلبه خصيصًا لك.",
          "This isn't ready-made, but can be made.",
        )}
      </p>
      {tailoringTime && <p className="text-xs text-muted-foreground">{tailoringTime}</p>}
      <Button
        type="button"
        variant="outline"
        className="h-11 gap-2 font-semibold"
        onClick={onTailor}
      >
        <Scissors className="h-4 w-4" />
        <span>{word}</span>
      </Button>
    </div>
  );
}
