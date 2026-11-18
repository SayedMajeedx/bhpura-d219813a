import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { LOOKS, POST_LOOKS, lookOf } from "../lib/looks";
import type { Post } from "../lib/types";

/**
 * A post's dress: plain, or one of the three looks. Choosing a look also puts the post on that
 * look's own cloth, which the colours above can change after.
 */
export function PostLookField({
  post,
  onChange,
}: {
  post: Post;
  onChange: (change: Partial<Post>) => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const current = lookOf(post);
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">{isAr ? "الشكل" : "Look"}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={current === "plain" ? "default" : "outline"}
          aria-pressed={current === "plain"}
          onClick={() => onChange({ look: undefined })}
        >
          {isAr ? "بسيط" : "Plain"}
        </Button>
        {POST_LOOKS.map((look) => (
          <Button
            key={look}
            type="button"
            size="sm"
            variant={current === look ? "default" : "outline"}
            aria-pressed={current === look}
            onClick={() => onChange({ look, tone: LOOKS[look].tone })}
          >
            {isAr ? LOOKS[look].name.ar : LOOKS[look].name.en}
          </Button>
        ))}
      </div>
    </div>
  );
}
