import React from "react";
import { Save, Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OrderStickyBottomBarProps {
  lang: "en" | "ar";
  primaryAction?: React.ReactNode;
  isDirty?: boolean;
  isCreationMode?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onMoreClick?: () => void;
}

export const OrderStickyBottomBar: React.FC<OrderStickyBottomBarProps> = ({
  lang,
  primaryAction,
  isDirty = false,
  isCreationMode = false,
  saving = false,
  onSave,
  onMoreClick,
}) => {
  const isAr = lang === "ar";

  return (
    <div
      className="no-print fixed bottom-0 inset-x-0 z-40 flex items-center gap-2 border-t border-border/80 bg-card/95 p-3 shadow-lg backdrop-blur-md sm:hidden"
      aria-label={isAr ? "إجراءات رئيسية سريعة" : "Primary Action Thumb Zone"}
    >
      {/* If dirty or in creation mode, prioritize Save Changes */}
      {(isDirty || isCreationMode) && onSave ? (
        <Button
          onClick={onSave}
          disabled={saving}
          className="min-h-11 flex-1 rounded-xl font-bold shadow-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 touch-manipulation"
        >
          {saving ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="me-2 h-4 w-4" />
          )}
          {isCreationMode
            ? isAr
              ? "إنشاء وحفظ الطلب"
              : "Create & Save Order"
            : isAr
              ? "حفظ التغييرات"
              : "Save Changes"}
        </Button>
      ) : (
        <div className="flex min-w-0 flex-1 [&>button]:min-h-11 [&>button]:w-full [&>button]:rounded-xl [&>button]:font-bold [&>button]:text-sm">
          {primaryAction || (
            <Button variant="outline" className="font-bold border-border/80">
              {isAr ? "نظرة عامة على الطلب" : "Review Order Details"}
            </Button>
          )}
        </div>
      )}

      {onMoreClick && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-xl bg-background border-border/80 touch-manipulation"
          onClick={onMoreClick}
          aria-label={isAr ? "المزيد من الخيارات" : "More options"}
        >
          <MoreHorizontal className="h-5 w-5 text-foreground" />
        </Button>
      )}
    </div>
  );
};
