import { useState } from "react";
import { CheckCircle2, ExternalLink, MessageCircle, Printer, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";
import { logActivity } from "@/lib/activity-log";
import { JobSheetPrintDialog } from "@/features/orders/components/JobSheetPrintDialog";
import type { SheetLang, SheetWhere } from "@/features/orders/lib/job-sheet";
import { afterSendActions, whereSentence } from "../lib/after-send";

/**
 * What follows a send, in the same window (step 2 of `docs/workshop-flow-plan.md`): where the
 * pieces now are ("Sent to Umm Ali on PO-0007, due 12 Nov"), then the job sheet in the
 * supplier's language, the message to the supplier, telling the customer, and the supplier
 * order. Each press is kept in the orders' activity. A person sends every message.
 */
export function AfterSendPanel({
  lang,
  where,
  orderIds,
  sheetLang,
  onPrint,
  supplierPhone,
  supplierMessage,
  onTellCustomer,
  onOpenOrder,
  onClose,
}: {
  lang: "ar" | "en";
  where: SheetWhere;
  /** The customers' orders the pieces came from: each press is noted on them. */
  orderIds: readonly string[];
  /** The supplier's language (else the screen's), where the print starts. */
  sheetLang: SheetLang;
  onPrint?: (sheetLang: SheetLang) => void;
  supplierPhone?: string | null;
  /** The message for the supplier, written in their language. */
  supplierMessage?: string;
  onTellCustomer?: () => void;
  onOpenOrder?: () => void;
  onClose: () => void;
}) {
  const isAr = lang === "ar";
  const [printing, setPrinting] = useState(false);
  const inHouse = !where.supplier;
  const actions = afterSendActions({
    inHouse,
    canPrint: Boolean(onPrint),
    supplierPhone: supplierMessage ? supplierPhone : null,
    customerReachable: Boolean(onTellCustomer),
    canOpenOrder: Boolean(onOpenOrder),
  });
  const note = (en: string, ar: string) => {
    for (const order_id of orderIds) {
      void logActivity({ action: "workshop_follow_up", order_id, en, ar });
    }
  };

  const chat = whatsappChatUrl(supplierPhone ?? null);
  const messageSupplier = () => {
    if (!chat || !supplierMessage) return;
    window.open(
      `${chat}?text=${encodeURIComponent(supplierMessage)}`,
      "_blank",
      "noopener,noreferrer",
    );
    note(
      `Opened WhatsApp to message ${where.supplier ?? "the supplier"} about the pieces`,
      `فتح واتساب لمراسلة ${where.supplier ?? "المورد"} عن القطع`,
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
          {inHouse
            ? isAr
              ? "القطع في ورشتنا"
              : "The pieces are in our workshop"
            : isAr
              ? "أُرسلت القطع"
              : "The pieces were sent"}
        </DialogTitle>
        <DialogDescription>{whereSentence(where, lang)}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        {actions.includes("print") && (
          <Button type="button" onClick={() => setPrinting(true)} className="justify-start gap-2">
            <Printer className="h-4 w-4" aria-hidden="true" />
            {isAr ? "اطبع أمر التشغيل" : "Print job sheet"}
          </Button>
        )}
        {actions.includes("message") && (
          <Button
            type="button"
            variant="outline"
            onClick={messageSupplier}
            className="justify-start gap-2"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            {isAr ? `راسل ${where.supplier} واتساب` : `Message ${where.supplier} on WhatsApp`}
          </Button>
        )}
        {actions.includes("tell") && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onTellCustomer?.()}
            className="justify-start gap-2"
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            {isAr ? "أبلغ العميل ببدء العمل" : "Tell the customer work has started"}
          </Button>
        )}
        {actions.includes("open") && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenOrder?.()}
            className="justify-start gap-2"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {isAr
              ? `افتح طلبية المورد ${where.poNumber ?? ""}`.trim()
              : `Open supplier order ${where.poNumber ?? ""}`.trim()}
          </Button>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {isAr ? "تم" : "Done"}
        </Button>
      </DialogFooter>

      {onPrint && (
        <JobSheetPrintDialog
          open={printing}
          onOpenChange={setPrinting}
          defaultLang={sheetLang}
          lang={lang}
          onPrint={(chosen) => {
            onPrint(chosen);
            note("Printed the job sheet after sending", "طبع أمر التشغيل بعد الإرسال");
          }}
        />
      )}
    </>
  );
}
