import { Link } from "@tanstack/react-router";
import { useStorefront } from "@/lib/storefront-context";

export function SizeGuideFooterLink({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const { brand, t } = useStorefront();
  return (
    <Link
      to="/$slug/size-guide"
      params={{ slug: brand.slug }}
      className={
        className ||
        "inline-flex min-h-[44px] items-center text-xs opacity-85 hover:opacity-100 py-1 transition-opacity"
      }
      style={style ?? { color: "var(--sf-footer-fg)" }}
    >
      {t("دليل المقاسات", "Size Guide")}
    </Link>
  );
}
export default SizeGuideFooterLink;
