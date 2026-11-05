import { Link } from "@tanstack/react-router";
import { Sticker } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";

/** The way in, from the content studio's own heading. */
export default function PostKitLink() {
  const { lang } = useI18n();
  const brand = useBrand();
  return (
    <Button asChild variant="outline" className="h-10 gap-2 rounded-xl text-xs font-semibold">
      <Link to="/admin/b/$slug/content-studio/posts" params={{ slug: brand.slug }}>
        <Sticker className="size-4 text-primary" />
        {lang === "ar" ? "عدّة البوستات" : "Post kit"}
      </Link>
    </Button>
  );
}
