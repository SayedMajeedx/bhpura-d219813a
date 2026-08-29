import { Button } from "@/components/ui/button";
import { RotateCcw, Sliders, Plus, Sparkles, AlertCircle } from "lucide-react";
import { useT } from "@/lib/i18n";

interface ReturnsCommandHeaderProps {
  lang: "en" | "ar";
  brandName: string;
  totalReturns: number;
  pendingReviewCount: number;
  onOpenPolicy: () => void;
  onNewReturn?: () => void;
}

export function ReturnsCommandHeader({
  lang,
  brandName,
  totalReturns,
  pendingReviewCount,
  onOpenPolicy,
  onNewReturn,
}: ReturnsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card shadow-2xs">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
          <RotateCcw className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold font-heading text-foreground tracking-tight">
              {isAr ? "مركز المرتجعات والاستبدال" : "Returns & Exchanges Center"}
            </h1>
            {pendingReviewCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <AlertCircle className="h-3 w-3" />
                {pendingReviewCount} {isAr ? "بانتظار المراجعة" : "action required"}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? `إدارة عمليات الإرجاع، فحص الجودة، إعادة المخزون، والتعويض المالي لـ ${brandName}`
              : `Manage returns, inspection, stock recovery, and refunds for ${brandName}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenPolicy}
          className="gap-1.5 h-9 text-xs font-medium border-border hover:bg-muted/50"
        >
          <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
          {isAr ? "سياسة الإرجاع" : "Return Policy"}
        </Button>

        {onNewReturn && (
          <Button
            variant="default"
            size="sm"
            onClick={onNewReturn}
            className="gap-1.5 h-9 text-xs font-semibold shadow-2xs bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            {isAr ? "إنشاء طلب إرجاع" : "New Return"}
          </Button>
        )}
      </div>
    </div>
  );
}
