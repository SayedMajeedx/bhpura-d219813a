import { useStorefront } from "@/lib/storefront-context";
import { Scissors } from "lucide-react";

export interface ProductTailoringSlotProps {
  product?: any;
  showSizeModeToggle?: boolean;
  sizeMode?: "ready" | "custom";
  setSizeMode?: (mode: "ready" | "custom") => void;
  passportConfigured?: boolean;
}

export function ProductTailoringSlot({
  showSizeModeToggle,
  sizeMode,
  setSizeMode,
  passportConfigured,
}: ProductTailoringSlotProps) {
  const { lang, t } = useStorefront();

  if (!showSizeModeToggle || sizeMode !== "custom") return null;

  return (
    <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-xs font-medium text-primary flex items-center gap-2 mb-3">
      <Scissors className="h-4 w-4 shrink-0" />
      <span>
        {t(
          passportConfigured
            ? "يرجى اختيار ملف المقاسات لإكمال طلب التفصيل:"
            : "يرجى إدخال قياسات التفصيل أدناه بدقة:",
          passportConfigured
            ? "Choose your saved fit profile to complete this custom order:"
            : "Please enter your custom tailoring measurements below accurately:",
        )}
      </span>
    </div>
  );
}
export default ProductTailoringSlot;
