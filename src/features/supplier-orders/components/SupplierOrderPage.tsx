import { formFromReorder, readReorderParam } from "../lib/reorder";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  MessageCircle,
  Printer,
  MoreHorizontal,
  PackageCheck,
  Pencil,
  Scissors,
  Send,
  Trash2,
  Undo2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { combinedLoadState, OsLoadFailedState } from "@/components/os/os-load-failed-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBrand } from "@/lib/brand-context";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/profile-context";
import { useMoneyLabel, useStoreCurrency } from "@/hooks/use-store-currency";
import {
  deleteSupplierOrder,
  invalidateSupplierOrders,
  setSupplierOrderStatus,
  supplierOrderQueries,
  type SupplierReceipt,
} from "@/lib/data/supplier-orders";
import { isOpen, localToday, paymentOf, piecesOf } from "../lib/order-state";
import { supplierOrderError } from "../lib/errors";
import { useSupplierCatalog } from "../hooks/use-supplier-catalog";
import { usePhoneBottomBar } from "../hooks/use-phone-bottom-bar";
import { SupplierOrderEditor } from "./SupplierOrderEditor";
import { SupplierOrderView } from "./SupplierOrderView";
import { ReceiveDialog } from "./ReceiveDialog";
import { PaymentDialog } from "./PaymentDialog";
import { SupplierMessageDialog } from "./SupplierMessageDialog";
import { JobSheetPrintDialog } from "@/features/orders/components/JobSheetPrintDialog";
import { sheetLanguageFor } from "@/features/orders/lib/job-sheet";
import { accountingQueries } from "@/lib/data/accounting";
import { usePrintSupplierSheets } from "../hooks/use-print-supplier-sheets";
import { PrintPurchaseOrderButton } from "./PurchaseOrderPrintDialog";
import { UndoReceivingDialog } from "./UndoReceivingDialog";
import { undoableReceipts } from "../lib/undo-receiving";

// "received": cancel or delete was asked for an order with pieces received; the dialog says to
// undo the receiving first.
type Confirming = "cancel" | "delete" | "received" | null;

/** One supplier order (`orderId` "new": a new one): read, received, paid, changed. */
export function SupplierOrderPage({
  orderId,
  reorder,
}: {
  orderId: string;
  /** A new order's sizes and pieces, from the "To reorder" tab (`reorderParam`). */
  reorder?: string;
}) {
  const { lang: rawLang } = useI18n();
  const lang = rawLang === "ar" ? "ar" : "en";
  const isAr = lang === "ar";
  const brand = useBrand();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission, isAdmin } = useProfile();
  const canReceive = isAdmin || hasPermission("manage_inventory");
  const currency = useStoreCurrency(brand.id);
  const moneyLabel = useMoneyLabel(lang);
  const isNew = orderId === "new";
  const orderQ = useQuery({
    ...supplierOrderQueries.detail(brand.id, orderId),
    enabled: !isNew && Boolean(brand.id),
  });
  const catalog = useSupplierCatalog(brand.id, lang);
  const [editing, setEditing] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [printingSheets, setPrintingSheets] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [busy, setBusy] = useState(false);
  const [undoing, setUndoing] = useState<SupplierReceipt[] | null>(null);
  const order = orderQ.data ?? null;
  const receiptsQ = useQuery({
    ...supplierOrderQueries.receipts(brand.id, orderId),
    enabled: !isNew && Boolean(brand.id),
  });
  const undoable = useMemo(
    () => (order ? undoableReceipts(receiptsQ.data ?? [], order.items) : []),
    [order, receiptsQ.data],
  );
  const today = localToday();
  const storeName =
    (isAr ? brand.name_ar || brand.name_en : brand.name_en || brand.name_ar) || brand.slug;
  // The customers' pieces on it print as their job sheets, in the supplier's language.
  const printSheets = usePrintSupplierSheets({
    brandId: brand.id,
    catalog,
    brandName: storeName,
    lang,
  });
  const vendorsQ = useQuery(accountingQueries.vendorOptions(brand.id));
  const sheetLang = sheetLanguageFor({
    vendorLang: (vendorsQ.data ?? []).find((v) => v.id === order?.vendor_id)?.preferred_language,
    screenLang: lang,
  });
  const hasCustomerPieces = Boolean(order?.items.some((l) => l.order_item_id));
  const loadState = combinedLoadState(isNew ? catalog.queries : [orderQ, ...catalog.queries]);
  const Back = isAr ? ArrowRight : ArrowLeft;
  const showEditor = isNew || editing;
  const pieces = order ? piecesOf(order) : null;
  const pay = order ? paymentOf(order) : null;
  const open = order ? isOpen(order) : false;
  const nothingArrived = pieces?.received === 0;
  const editable = order && order.status !== "received" && order.status !== "cancelled";
  // Delete was asked for an order that has payments: it is offered to be cancelled instead.
  const heldByPayments = confirming === "delete" && (pay?.paid ?? 0) > 0;
  const cancelInstead = heldByPayments && order?.status !== "cancelled";
  usePhoneBottomBar("supplier-order-actions", Boolean(order) && !showEditor);

  const toList = () =>
    navigate({ to: "/admin/b/$slug/supplier-orders", params: { slug: brand.slug } });

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await work();
      await invalidateSupplierOrders(qc, brand.id);
      toast.success(done);
    } catch (error) {
      toast.error(supplierOrderError(error, isAr));
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const place = () =>
    run(
      () => setSupplierOrderStatus(brand.id, orderId, "ordered"),
      isAr ? "أُرسلت الطلبية" : "Order placed",
    );
  const cancel = () =>
    run(
      () => setSupplierOrderStatus(brand.id, orderId, "cancelled"),
      isAr ? "أُلغيت الطلبية" : "Order cancelled",
    );
  const remove = () =>
    run(
      async () => {
        await deleteSupplierOrder(brand.id, orderId);
        await toList();
      },
      isAr ? "حُذفت الطلبية" : "Order deleted",
    );

  const title = isNew
    ? isAr
      ? "طلبية جديدة"
      : "New supplier order"
    : order
      ? isAr
        ? `طلبية ${order.po_number}`
        : `Order ${order.po_number}`
      : isAr
        ? "طلبية مورد"
        : "Supplier order";

  return (
    <div
      className="mx-auto w-full min-w-0 max-w-3xl space-y-4 p-2 pb-32 sm:p-4 sm:pb-16"
      dir={isAr ? "rtl" : "ltr"}
    >
      <Link
        to="/admin/b/$slug/supplier-orders"
        params={{ slug: brand.slug }}
        className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <Back className="h-4 w-4" aria-hidden="true" />
        {isAr ? "طلبيات الموردين" : "Supplier orders"}
      </Link>

      <AdminPageHeader
        icon={Scissors}
        title={<span dir="auto">{title}</span>}
        actions={
          order && !showEditor ? (
            <div className="flex items-center gap-2">
              {order.status !== "cancelled" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMessaging(true)}
                  className="h-9 gap-1.5"
                  aria-label={isAr ? "رسالة للمورد على واتساب" : "Message the supplier on WhatsApp"}
                >
                  <MessageCircle className="h-4 w-4 text-success" aria-hidden="true" />
                  <span className="hidden sm:inline">{isAr ? "رسالة للمورد" : "Message"}</span>
                </Button>
              )}
              <PrintPurchaseOrderButton
                {...{ order, catalog, storeName, currency, lang }}
                brandId={brand.id}
                supplierLang={sheetLang}
              />
              {hasCustomerPieces && order.status !== "cancelled" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPrintingSheets(true)}
                  className="h-9 gap-1.5"
                  aria-label={isAr ? "اطبع أوامر التشغيل" : "Print job sheets"}
                >
                  <Printer className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{isAr ? "أوامر التشغيل" : "Job sheets"}</span>
                </Button>
              )}
              <OrderMenu
                isAr={isAr}
                canEdit={Boolean(editable)}
                canPlace={order.status === "draft"}
                canCancel={order.status !== "cancelled"}
                canDelete
                canUndo={canReceive && undoable.length > 0}
                onEdit={() => setEditing(true)}
                onPlace={place}
                onCancel={() => setConfirming(nothingArrived ? "cancel" : "received")}
                onDelete={() => setConfirming(nothingArrived ? "delete" : "received")}
                onUndo={() => setUndoing(undoable)}
              />
            </div>
          ) : undefined
        }
      />

      {loadState === "loading" ? (
        <RoutePendingSkeleton />
      ) : loadState === "failed" ? (
        <OsLoadFailedState
          isAr={isAr}
          title={isAr ? "تعذّر تحميل الطلبية" : "The order could not be loaded"}
          description={
            isAr
              ? "لم يتغير شيء. تحقق من الاتصال ثم أعد المحاولة."
              : "Nothing was changed. Check the connection and try again."
          }
          queries={isNew ? catalog.queries : [orderQ, ...catalog.queries]}
        />
      ) : !isNew && !order ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {isAr ? "لم تعد هذه الطلبية موجودة." : "This order no longer exists."}
        </Card>
      ) : showEditor ? (
        <SupplierOrderEditor
          key={order?.id ?? "new"}
          brandId={brand.id}
          order={order}
          startWith={isNew && reorder ? formFromReorder(readReorderParam(reorder), catalog) : null}
          catalog={catalog}
          currency={currency}
          moneyLabel={moneyLabel}
          lang={lang}
          onCancel={() => (isNew ? toList() : setEditing(false))}
          onSaved={(id) => {
            setEditing(false);
            if (isNew) {
              navigate({
                to: "/admin/b/$slug/supplier-orders/$id",
                params: { slug: brand.slug, id },
                replace: true,
              });
            }
          }}
        />
      ) : order ? (
        <>
          <SupplierOrderView
            brandId={brand.id}
            order={order}
            catalog={catalog}
            currency={currency}
            today={today}
            storeName={
              (isAr ? brand.name_ar || brand.name_en : brand.name_en || brand.name_ar) || brand.slug
            }
            onUndo={canReceive ? setUndoing : undefined}
            lang={lang}
          />

          {(open && canReceive) || (pay && pay.owed > 0 && order.status !== "draft") ? (
            <div className="sticky bottom-0 z-10 -mx-2 flex flex-wrap gap-2 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:rounded-xl sm:border">
              {open && canReceive && (
                <Button
                  type="button"
                  onClick={() => setReceiving(true)}
                  className="min-h-11 flex-1 gap-1.5 font-bold sm:flex-none"
                >
                  <PackageCheck className="h-4 w-4" aria-hidden="true" />
                  {pieces && pieces.received > 0
                    ? isAr
                      ? `استلام الباقي (${pieces.remaining})`
                      : `Receive the rest (${pieces.remaining})`
                    : isAr
                      ? "استلام القطع"
                      : "Receive pieces"}
                </Button>
              )}
              {pay && pay.owed > 0 && order.status !== "draft" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPaying(true)}
                  className="min-h-11 flex-1 gap-1.5 sm:flex-none"
                >
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                  {isAr ? "تسجيل دفعة" : "Record payment"}
                </Button>
              )}
            </div>
          ) : null}

          {order.status === "draft" && (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? "هذه مسودة: أرسلها عندما تتفق مع المورد لتظهر بانتظار الاستلام."
                  : "This is a draft: place it once agreed with the supplier, and it awaits delivery."}
              </p>
              <Button type="button" onClick={place} disabled={busy} className="gap-1.5">
                <Send className="h-4 w-4" aria-hidden="true" />
                {isAr ? "إرسال الطلبية" : "Place order"}
              </Button>
            </Card>
          )}

          <ReceiveDialog
            open={receiving}
            onOpenChange={setReceiving}
            brandId={brand.id}
            order={order}
            catalog={catalog}
            currency={currency}
            lang={lang}
          />
          <JobSheetPrintDialog
            open={printingSheets}
            onOpenChange={setPrintingSheets}
            defaultLang={sheetLang}
            lang={lang}
            title={isAr ? "اطبع أوامر التشغيل" : "Print job sheets"}
            onPrint={(chosen) => void printSheets(order, chosen)}
          />
          {messaging && (
            <SupplierMessageDialog
              open={messaging}
              onOpenChange={setMessaging}
              brandId={brand.id}
              order={order}
              catalog={catalog}
              storeName={storeName}
              currency={currency}
              lang={lang}
            />
          )}
          <UndoReceivingDialog
            open={undoing !== null}
            onOpenChange={(next) => !next && setUndoing(null)}
            brandId={brand.id}
            orderId={order.id}
            receipts={undoing ?? []}
            catalog={catalog}
            lang={lang}
          />
          <PaymentDialog
            open={paying}
            onOpenChange={setPaying}
            brandId={brand.id}
            order={order}
            currency={currency}
            moneyLabel={moneyLabel}
            lang={lang}
          />
        </>
      ) : null}

      {/* An order with payments is not deleted (their record would be lost): the database refuses
          it, so the dialog says why and offers to cancel it instead, which keeps it on record. */}
      <AlertDialog open={confirming !== null} onOpenChange={(next) => !next && setConfirming(null)}>
        <AlertDialogContent dir={isAr ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "received"
                ? isAr
                  ? "وصلت قطع من هذه الطلبية"
                  : "Pieces of this order arrived"
                : heldByPayments
                  ? isAr
                    ? "لا تُحذف طلبية عليها دفعات"
                    : "An order with payments is not deleted"
                  : confirming === "delete"
                    ? isAr
                      ? "حذف الطلبية؟"
                      : "Delete this order?"
                    : isAr
                      ? "إلغاء الطلبية؟"
                      : "Cancel this order?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "received"
                ? canReceive && undoable.length > 0
                  ? isAr
                    ? "لا تُلغى طلبية ولا تُحذف وفيها قطع مستلمة: دخلت المخزون وتغيرت بها التكلفة. ألغِ الاستلام أولاً، ثم ألغِ الطلبية أو احذفها."
                    : "An order with pieces received is not cancelled or deleted: they joined the stock and set its cost. Undo the receiving first, then cancel or delete the order."
                  : isAr
                    ? "لا تُلغى طلبية ولا تُحذف وفيها قطع مستلمة: دخلت المخزون وتغيرت بها التكلفة. يلغي الاستلام من يدير المخزون."
                    : "An order with pieces received is not cancelled or deleted: they joined the stock and set its cost. Someone who manages the stock can undo the receiving."
                : heldByPayments && pay
                  ? isAr
                    ? `دفعت ${formatMoney(pay.paid, currency, lang)} على هذه الطلبية، وحذفها يمحو سجل الدفعة. ${cancelInstead ? "ألغِ الطلبية لتبقى في السجل ملغاة، أو " : ""}ألغِ الدفعة أولاً من قائمة الدفعات ثم احذفها.`
                    : `You paid ${formatMoney(pay.paid, currency, lang)} on this order, and deleting it would erase that payment's record. ${cancelInstead ? "Cancel the order to keep it on record, or take" : "Take"} the payment back first in the payments list, then delete it.`
                  : confirming === "delete"
                    ? isAr
                      ? "تُحذف الطلبية وسطورها نهائياً. لم يصل منها شيء، فلا يتغير المخزون."
                      : "The order and its lines are deleted for good. Nothing of it arrived, so the stock does not change."
                    : isAr
                      ? "تبقى الطلبية في السجل ملغاة، ولا يُنتظر منها شيء."
                      : "The order stays on record as cancelled, and nothing is awaited from it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{isAr ? "تراجع" : "Keep it"}</AlertDialogCancel>
            {confirming === "received" && canReceive && undoable.length > 0 && (
              <AlertDialogAction
                onClick={() => {
                  setConfirming(null);
                  setUndoing(undoable);
                }}
                className="gap-1.5"
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                {isAr ? "إلغاء الاستلام" : "Undo receiving"}
              </AlertDialogAction>
            )}
            {confirming !== "received" && (!heldByPayments || cancelInstead) && (
              <AlertDialogAction
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  if (confirming === "delete" && !heldByPayments) void remove();
                  else void cancel();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {heldByPayments
                  ? isAr
                    ? "إلغاء الطلبية بدلاً من ذلك"
                    : "Cancel the order instead"
                  : confirming === "delete"
                    ? isAr
                      ? "حذف"
                      : "Delete"
                    : isAr
                      ? "إلغاء الطلبية"
                      : "Cancel order"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OrderMenu({
  isAr,
  canEdit,
  canPlace,
  canCancel,
  canDelete,
  canUndo,
  onEdit,
  onPlace,
  onCancel,
  onDelete,
  onUndo,
}: {
  isAr: boolean;
  canEdit: boolean;
  canPlace: boolean;
  canCancel: boolean;
  canDelete: boolean;
  canUndo: boolean;
  onEdit: () => void;
  onPlace: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onUndo: () => void;
}) {
  if (!canEdit && !canPlace && !canCancel && !canDelete && !canUndo) return null;
  return (
    <div className="flex items-center gap-2">
      {canEdit && (
        <Button type="button" variant="outline" size="sm" onClick={onEdit} className="h-9 gap-1.5">
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {isAr ? "تعديل" : "Edit"}
        </Button>
      )}
      {(canPlace || canCancel || canDelete || canUndo) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label={isAr ? "خيارات الطلبية" : "Order options"}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canPlace && (
              <DropdownMenuItem onSelect={onPlace}>
                <Send className="h-4 w-4" aria-hidden="true" />
                {isAr ? "إرسال الطلبية" : "Place order"}
              </DropdownMenuItem>
            )}
            {canUndo && (
              <DropdownMenuItem onSelect={onUndo}>
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                {isAr ? "إلغاء الاستلام" : "Undo receiving"}
              </DropdownMenuItem>
            )}
            {canCancel && (
              <DropdownMenuItem onSelect={onCancel}>
                <Ban className="h-4 w-4" aria-hidden="true" />
                {isAr ? "إلغاء الطلبية" : "Cancel order"}
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem onSelect={onDelete} className="text-destructive">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {isAr ? "حذف" : "Delete"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
