import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const content = (
    <div
      className="no-print fixed bottom-0 inset-x-0 z-50 flex items-center gap-2.5 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/50 dark:border-white/15 bg-white/75 dark:bg-black/70 shadow-[0_-8px_32px_rgba(0,0,0,0.12),inset_0_1px_1.5px_rgba(255,255,255,0.7)] backdrop-blur-2xl backdrop-saturate-200 sm:hidden animate-in slide-in-from-bottom-6 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] select-none"
      aria-label={isAr ? "إجراءات رئيسية سريعة" : "Primary Action Thumb Zone"}
    >
      {/* Specular top reflection line */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent"
        aria-hidden="true"
      />

      {/* Primary CTA Slot (Takes Full Available Width) */}
      {(isDirty || isCreationMode) && onSave ? (
        <Button
          onClick={onSave}
          disabled={saving}
          className="relative overflow-hidden min-h-11 flex-1 rounded-2xl font-bold shadow-lg shadow-primary/25 text-sm bg-gradient-to-b from-primary via-primary/95 to-primary/85 text-primary-foreground border border-white/30 hover:opacity-95 active:scale-[0.97] transition-all duration-150 touch-manipulation"
        >
          {/* Specular light highlight */}
          <div
            className="pointer-events-none absolute inset-x-2 top-0.5 h-2 rounded-full bg-gradient-to-b from-white/35 to-transparent blur-[0.5px]"
            aria-hidden="true"
          />
          {saving ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin shrink-0" />
          ) : (
            <Save className="me-2 h-4 w-4 shrink-0" />
          )}
          <span>
            {isCreationMode
              ? isAr
                ? "إنشاء وحفظ الطلب"
                : "Create & Save Order"
              : isAr
                ? "حفظ التغييرات"
                : "Save Changes"}
          </span>
          {isDirty && !saving && (
            <span className="ms-2 flex h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse" />
          )}
        </Button>
      ) : (
        <div className="flex min-w-0 flex-1 [&>button]:min-h-11 [&>button]:w-full [&>button]:rounded-2xl [&>button]:font-bold [&>button]:text-sm [&>button]:shadow-sm [&>button]:border-white/50 dark:[&>button]:border-white/15 [&>button]:bg-card/85 dark:[&>button]:bg-card/50 [&>button]:backdrop-blur-md [&>button]:active:scale-[0.97] [&>button]:transition-all">
          {primaryAction || (
            <Button variant="outline" className="font-bold border-white/50 dark:border-white/15">
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
              className="h-11 w-11 shrink-0 rounded-2xl bg-card/80 dark:bg-card/50 border-white/50 dark:border-white/15 backdrop-blur-md touch-manipulation shadow-xs active:scale-90 transition-all duration-150"
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

  return createPortal(content, document.body);
};
