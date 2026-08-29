import { ShoppingCart, RefreshCw, Settings2, Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

interface AbandonedCartsCommandHeaderProps {
  onOpenSettings?: () => void;
  isEnabled: boolean;
}

export function AbandonedCartsCommandHeader({
  onOpenSettings,
  isEnabled,
}: AbandonedCartsCommandHeaderProps) {
  const { lang, t } = useI18n();
  const isAr = lang === "ar";

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
          <ShoppingCart className="h-6 w-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-display">
              {isAr ? "السلات المتروكة والاستعادة" : "Abandoned Carts Recovery"}
            </h1>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                isEnabled
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {isEnabled ? (isAr ? "مفعّل" : "Active") : (isAr ? "معطّل" : "Disabled")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAr
              ? "استعادة الإيرادات المفقودة تلقائياً عبر رسائل ذكية (WhatsApp/Email) مع أكواد خصم حصرية مخصصة."
              : "Recover lost revenue with intelligent multi-channel sequences and dynamic single-use discounts."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {onOpenSettings && (
          <Button
            variant="default"
            size="default"
            onClick={onOpenSettings}
            className="min-h-[44px] gap-2 bg-primary text-primary-foreground"
          >
            <Settings2 className="h-4 w-4" />
            <span>{isAr ? "إعدادات الاستعادة" : "Recovery Settings"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
