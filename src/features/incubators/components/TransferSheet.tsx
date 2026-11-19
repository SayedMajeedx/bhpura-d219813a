import { useState } from "react";
import { FileSpreadsheet, MessageCircle, Printer, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildWhatsAppLink } from "@/lib/os-formatting";
import { moneyFractionDigits, westernNumeralLocale } from "@/lib/format";
import { countOf } from "@/lib/arabic-count";
import { downloadWorkbook } from "@/features/finance-reports/lib/workbook";
import type { IncubatorsPageState } from "@/features/incubators/hooks/use-incubators-page";
import { transferLabel } from "@/features/incubators/lib/move-pieces";
import { partnerStockSheet } from "@/features/incubators/lib/stock-sheet";
import {
  sheetLines,
  sheetTotals,
  transferFileName,
  transferHtml,
  transferMessage,
  transferSheet,
  type SheetContext,
  type TransferRow,
} from "@/features/incubators/lib/transfer-sheet";
import { AppDialog, AppDialogBody, AppDialogHeader } from "@/components/ui/app-dialog";

/**
 * A transfer's sheet on the partner's page: the Excel, the A4 delivery note and the WhatsApp
 * message for any batch, in the Transfers tab and straight after a send or a move. Read from the
 * copy kept of each line as it was sent, so an old batch's sheet says what was sent that day.
 */

function sheetContextFor(page: IncubatorsPageState) {
  const { incubators, isAr, lang, storeName, money, currency, locale } = page;
  const nameOf = (id: string | null) =>
    id ? (incubators.find((partner) => partner.id === id)?.name ?? "") : isAr ? "المحل" : "Store";
  return (transfer: TransferRow): SheetContext => ({
    lang,
    store: storeName || (isAr ? "المتجر" : "Store"),
    from: nameOf(transfer.from_incubator_id),
    to: nameOf(transfer.to_incubator_id),
    partner: nameOf(
      transfer.kind === "return" ? transfer.from_incubator_id : transfer.to_incubator_id,
    ),
    date: new Date(transfer.created_at).toLocaleDateString(westernNumeralLocale(locale), {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    money: (amount: number) => money(amount),
    digits: moneyFractionDigits(currency),
  });
}

/** The three ways a batch reaches its partner. */
export function TransferSheetButtons({
  page,
  transfer,
  size = "sm",
}: {
  page: IncubatorsPageState;
  transfer: TransferRow;
  size?: "sm" | "default";
}) {
  const { isAr, brand, incubators } = page;
  const contextOf = sheetContextFor(page);
  const [busy, setBusy] = useState(false);
  const context = contextOf(transfer);
  const partnerId =
    transfer.kind === "return" ? transfer.from_incubator_id : transfer.to_incubator_id;
  const phone = incubators.find((partner) => partner.id === partnerId)?.phone ?? null;
  const whatsApp = buildWhatsAppLink(phone, transferMessage(transfer, context));

  const excel = async () => {
    setBusy(true);
    try {
      await downloadWorkbook(
        [transferSheet(transfer, context)],
        transferFileName(brand.slug, transfer.number),
      );
    } catch {
      toast.error(
        isAr ? "تعذّر تنزيل الملف. حاول مرة أخرى." : "The file could not be downloaded. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const print = () => {
    const sheet = window.open("", "_blank", "width=900,height=1000");
    if (!sheet) {
      toast.error(
        isAr
          ? "تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى."
          : "The print window was blocked. Allow pop-ups and try again.",
      );
      return;
    }
    sheet.document.open();
    sheet.document.write(transferHtml(transfer, context));
    sheet.document.close();
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button size={size} onClick={() => void excel()} disabled={busy}>
        <FileSpreadsheet className="me-1.5 h-4 w-4" aria-hidden />
        Excel
      </Button>
      <Button size={size} variant="outline" onClick={print}>
        <Printer className="me-1.5 h-4 w-4" aria-hidden />
        {isAr ? "ورقة التسليم" : "Delivery note"}
      </Button>
      {whatsApp && (
        <Button size={size} variant="outline" asChild>
          <a href={whatsApp} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="me-1.5 h-4 w-4" aria-hidden />
            {isAr ? "واتساب" : "WhatsApp"}
          </a>
        </Button>
      )}
    </div>
  );
}

/**
 * "Sent to RA Boutique", "Returned from دار لولوة", "Moved from دار لولوة to RA Boutique".
 * Each name is isolated (FSI … PDI), so a Latin name in an Arabic sentence, or an Arabic one in
 * an English sentence, does not pull the words and numbers around it out of order.
 */
export function transferWhat(context: SheetContext, kind: TransferRow["kind"], isAr: boolean) {
  const from = isolate(context.from);
  const to = isolate(context.to);
  if (kind === "send") return isAr ? `إرسال إلى ${to}` : `Sent to ${to}`;
  if (kind === "return") return isAr ? `إرجاع من ${from}` : `Returned from ${from}`;
  return isAr ? `نقل من ${from} إلى ${to}` : `Moved from ${from} to ${to}`;
}

const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);
const isolate = (text: string) => `${FSI}${text}${PDI}`;

/** The sheet of one batch, opened after a send or a move, or from the Transfers tab. */
export function TransferSheetDialog({ page }: { page: IncubatorsPageState }) {
  const { isAr, lang, shownTransferId, transfers, money } = page;
  const contextOf = sheetContextFor(page);
  const transfer = transfers.find((row) => row.id === shownTransferId) ?? null;
  const open = Boolean(shownTransferId);
  const context = transfer ? contextOf(transfer) : null;
  const totals = transfer ? sheetTotals(sheetLines(transfer, money, lang)) : null;

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => !next && page.showTransfer(null)}
      kind="form"
      dir={isAr ? "rtl" : "ltr"}
    >
      <AppDialogHeader
        title={
          <>
            <ArrowLeftRight className="h-4 w-4" aria-hidden />
            {transfer ? transferLabel(transfer.number) : isAr ? "التحويل" : "Transfer"}
          </>
        }
        description={
          transfer && context
            ? transferWhat(context, transfer.kind, isAr)
            : isAr
              ? "جارٍ تحميل التحويل…"
              : "Loading the transfer…"
        }
      />

      <AppDialogBody>
        {transfer && totals && (
          <div className="space-y-4">
            <p className="text-sm">
              {countOf(totals.pieces, "piece", lang)} · {money(totals.value)}
            </p>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "نزّل الملف وأرسله للمحل الشريك مع البضاعة، أو اطبع ورقة التسليم ليوقّعها الطرفان."
                : "Download the file and send it to the partner with the pieces, or print the delivery note for both sides to sign."}
            </p>
            <TransferSheetButtons page={page} transfer={transfer} size="default" />
          </div>
        )}
      </AppDialogBody>
    </AppDialog>
  );
}

/** Every batch that went to, came from or moved through the open partner, newest first. */
export function IncubatorTransfersTab({ page }: { page: IncubatorsPageState }) {
  const {
    isAr,
    lang,
    currentId,
    current,
    transfers,
    transfersLoading,
    money,
    allStock,
    brand,
    locale,
  } = page;
  const contextOf = sheetContextFor(page);
  const own = transfers.filter(
    (row) => row.from_incubator_id === currentId || row.to_incubator_id === currentId,
  );
  const held = allStock.filter((item) => item.incubator_id === currentId);

  const stockExcel = async () => {
    try {
      await downloadWorkbook(
        [
          partnerStockSheet(held, {
            lang,
            store: page.storeName || (isAr ? "المتجر" : "Store"),
            partner: current?.name ?? "",
            date: new Date().toLocaleDateString(westernNumeralLocale(locale)),
            digits: moneyFractionDigits(page.currency),
          }),
        ],
        `${brand.slug || "store"}-partner-stock.xlsx`,
      );
    } catch {
      toast.error(
        isAr ? "تعذّر تنزيل الملف. حاول مرة أخرى." : "The file could not be downloaded. Try again.",
      );
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "كل دفعة أُرسلت أو رجعت أو نُقلت لها رقم وملف."
            : "Every batch sent, returned or moved has a number and a file."}
        </p>
        <Button size="sm" variant="outline" onClick={() => void stockExcel()}>
          <FileSpreadsheet className="me-1.5 h-4 w-4" aria-hidden />
          {isAr ? "Excel البضاعة الحالية" : "Current stock Excel"}
        </Button>
      </div>
      {transfersLoading ? (
        <p className="text-sm text-muted-foreground">{isAr ? "جارٍ التحميل…" : "Loading…"}</p>
      ) : own.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {isAr
            ? "لا توجد تحويلات مسجّلة بعد. التحويلات تُرقَّم من الآن."
            : "No transfers recorded yet. Transfers are numbered from now on."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {own.map((transfer) => {
            const context = contextOf(transfer);
            const totals = sheetTotals(sheetLines(transfer, money, lang));
            return (
              <li
                key={transfer.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  {/* The number is its own run: beside an Arabic date it read "TR-00031 نوفمبر". */}
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <bdi className="font-bold">{transferLabel(transfer.number)}</bdi>
                    <span className="text-muted-foreground">{context.date}</span>
                  </p>
                  <p className="break-words text-xs text-muted-foreground" dir="auto">
                    {transferWhat(context, transfer.kind, isAr)} ·{" "}
                    {countOf(totals.pieces, "piece", lang)}
                    {transfer.kind !== "return" ? ` · ${money(totals.value)}` : ""}
                  </p>
                </div>
                <TransferSheetButtons page={page} transfer={transfer} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
