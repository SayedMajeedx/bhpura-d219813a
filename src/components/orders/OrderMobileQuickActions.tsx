import React from "react";
import { Phone, Printer, Send, Copy, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OrderMobileQuickActionsProps {
  lang: "en" | "ar";
  customerPhone?: string | null;
  onSendWhatsApp?: () => void;
  onPrintReceipt?: () => void;
  onCopyLink?: () => void;
  sendInvoiceDialogTrigger?: React.ReactNode;
}

export const OrderMobileQuickActions: React.FC<OrderMobileQuickActionsProps> = ({
  lang,
  customerPhone,
  onSendWhatsApp,
  onPrintReceipt,
  onCopyLink,
  sendInvoiceDialogTrigger,
}) => {
  const isAr = lang === "ar";
  const cleanPhone = (customerPhone || "").replace(/[^\d]/g, "");

  return (
    <section
      className="no-print grid grid-cols-4 gap-1.5 rounded-2xl border border-border/70 bg-card p-2 shadow-2xs sm:hidden"
      aria-label={isAr ? "إجراءات سريعة للجوال" : "Mobile Quick Actions"}
    >
      {/* WhatsApp / Send Invoice */}
      {sendInvoiceDialogTrigger || (
        <Button
          variant="outline"
          size="sm"
          onClick={onSendWhatsApp}
          className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl p-1 text-[10px] font-bold border-border/80 text-foreground hover:bg-muted touch-manipulation"
        >
          <Send className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span>{isAr ? "واتساب" : "WhatsApp"}</span>
        </Button>
      )}

      {/* Call Customer */}
      {cleanPhone ? (
        <a
          href={`tel:${cleanPhone}`}
          className="inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-border/80 bg-background p-1 text-[10px] font-bold text-foreground hover:bg-muted active:scale-95 transition-transform touch-manipulation text-center"
        >
          <Phone className="h-4 w-4 text-primary" />
          <span>{isAr ? "اتصال" : "Call"}</span>
        </a>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled
          className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl p-1 text-[10px] font-bold opacity-50"
        >
          <Phone className="h-4 w-4" />
          <span>{isAr ? "اتصال" : "Call"}</span>
        </Button>
      )}

      {/* Print Thermal Receipt */}
      <Button
        variant="outline"
        size="sm"
        onClick={onPrintReceipt}
        className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl p-1 text-[10px] font-bold border-border/80 text-foreground hover:bg-muted touch-manipulation"
      >
        <Receipt className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span>{isAr ? "إيصال" : "Receipt"}</span>
      </Button>

      {/* Copy Invoice Link */}
      <Button
        variant="outline"
        size="sm"
        onClick={onCopyLink}
        className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl p-1 text-[10px] font-bold border-border/80 text-foreground hover:bg-muted touch-manipulation"
      >
        <Copy className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span>{isAr ? "الرابط" : "Copy Link"}</span>
      </Button>
    </section>
  );
};
