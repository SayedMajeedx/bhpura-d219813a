import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";

/**
 * The small picture of an order line. It tries each picture in turn (the variant's own, then
 * the product's) and moves to the next when one fails to load: a variant can still point at a
 * picture that was later removed from the store's media, and a broken-image icon tells staff
 * nothing. With no picture left it shows the placeholder.
 */
export function LineThumbnail({
  sources,
  alt,
}: {
  sources: Array<string | null | undefined>;
  alt: string;
}) {
  const candidates = [...new Set(sources.filter((src): src is string => Boolean(src)))];
  const [failed, setFailed] = useState(0);
  const src = candidates[failed];

  if (!src) return <ImageIcon className="h-5 w-5 text-muted-foreground" />;
  return (
    <img
      key={src}
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      onError={() => setFailed((count) => count + 1)}
    />
  );
}
