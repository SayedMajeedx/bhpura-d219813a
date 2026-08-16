import React from "react";
import { Save, Loader2, MoreHorizontal, Phone, Receipt, Printer, Copy, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface OrderStickyBottomBarProps {
  lang: "en" | "ar";
  primaryAction?: React.ReactNode;
  isDirty?: boolean;
  isCreationMode?: boolean;
  saving?: boolean;
  customerPhone?: string | null;
  onSave?: () => void;
  onPrintReceipt?: () => void;
  onPrintA4?: () => void;
  onCopyLink?: () => void;
  sendInvoiceDialogTrigger?: React.ReactNode;
}

export const OrderStickyBottomBar: React.FC<OrderStickyBottomBarProps> = ({
  lang,
  primaryAction,
  isDirty = false,
  isCreationMode = false,
  saving = false,
  customerPhone,
  onSave,
  onPrintReceipt,
  onPrintA4,
  onCopyLink,
  sendInvoiceDialogTrigger,
}) => {
  const isAr = lang === "ar";
  const cleanPhone = (customerPhone || "").replace(/[^\d]/g, "");

  return (
    <div
      className="no-print fixed bottom-[64px] inset-x-0 z-50 flex items-center gap-2 border-t border-border/80 bg-background/95 px-4 py-3 shadow-2xl backdrop-blur-md sm:hidden"
      style={{ bottom: "64px" }}
      aria-label={isAr ? "إجراءات رئيسية سريعة" : "Primary Action Thumb Zone"}
    >
      {/* Primary CTA Slot (Takes Full Available Width) */}
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
        <div className="flex min-w-0 flex-1 [&>button]:min-h-11 [&>button]:w-full [&>button]:rounded-xl [&>button]:font-bold [&>button]:text-sm [&>button]:shadow-md">
          {primaryAction || (
            <Button variant="outline" className="font-bold border-border/80">
              {isAr ? "نظرة عامة على الطلب" : "Review Order Details"}
            </Button>
          )}
        </div>
      )}

      {/* Secondary Actions Overflow Menu ("...") */}
      {!isCreationMode && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl bg-background border-border/80 touch-manipulation shadow-xs active:scale-95"
              aria-label={isAr ? "المزيد من الخيارات" : "More options"}
            >
              <MoreHorizontal className="h-5 w-5 text-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={isAr ? "start" : "end"}
            side="top"
            sideOffset={8}
            className="w-56 font-sans rounded-xl p-1.5 shadow-xl border-border/80"
          >
            <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {isAr ? "إجراءات إضافية" : "Secondary Actions"}
            </div>
            <DropdownMenuSeparator />

            {/* WhatsApp / Send Invoice */}
            {sendInvoiceDialogTrigger ? (
              <div className="w-full text-left [&>button]:w-full [&>button]:justify-start [&>button]:h-9 [&>button]:px-2 [&>button]:text-xs [&>button]:font-medium">
                {sendInvoiceDialogTrigger}
              </div>
            ) : null}

            {/* Call Customer */}
            {cleanPhone ? (
              <DropdownMenuItem asChild>
                <a
                  href={`tel:${cleanPhone}`}
                  className="cursor-pointer flex items-center gap-2.5 px-2 py-2 text-xs font-medium rounded-lg"
                >
                  <Phone className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{isAr ? "اتصال بالعميل" : "Call Customer"}</span>
                </a>
              </DropdownMenuItem>
            ) : null}

            {/* Print Thermal Receipt */}
            {onPrintReceipt && (
              <DropdownMenuItem
                onClick={onPrintReceipt}
                className="cursor-pointer flex items-center gap-2.5 px-2 py-2 text-xs font-medium rounded-lg"
              >
                <Receipt className="h-4 w-4 text-amber-600 shrink-0" />
                <span>{isAr ? "طباعة إيصال حراري" : "Print Receipt"}</span>
              </DropdownMenuItem>
            )}

            {/* Print A4 Invoice */}
            {onPrintA4 && (
              <DropdownMenuItem
                onClick={onPrintA4}
                className="cursor-pointer flex items-center gap-2.5 px-2 py-2 text-xs font-medium rounded-lg"
              >
                <Printer className="h-4 w-4 text-purple-600 shrink-0" />
                <span>{isAr ? "طباعة فاتورة A4" : "Print A4 Invoice"}</span>
              </DropdownMenuItem>
            )}

            {/* Copy Invoice Link */}
            {onCopyLink && (
              <DropdownMenuItem
                onClick={onCopyLink}
                className="cursor-pointer flex items-center gap-2.5 px-2 py-2 text-xs font-medium rounded-lg"
              >
                <Copy className="h-4 w-4 text-blue-600 shrink-0" />
                <span>{isAr ? "نسخ رابط الفاتورة" : "Copy Invoice Link"}</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
