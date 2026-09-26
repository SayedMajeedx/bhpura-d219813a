import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n, useT } from "@/lib/i18n";
import { deleteBrand, superAdminQueries } from "@/lib/data/super-admin";
import { purgeBrandPublicMedia } from "@/lib/r2-upload";
import { purgeBrandPrivateReceipts } from "@/lib/benefit-receipt.functions";

/**
 * Deletes a brand: deactivate and remove, or (hard) purge the database and then
 * its public media and private receipts. If the media cleanup fails after the
 * purge, the dialog stays open to retry only the cleanup.
 */
export function DeleteBrandDialog({
  brand,
  onDone,
}: {
  brand: { id: string; slug: string; name_en: string };
  onDone: () => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [confirm, setConfirm] = useState("");
  const [hard, setHard] = useState(false);
  const [working, setWorking] = useState(false);
  const [databasePurged, setDatabasePurged] = useState(false);

  const countsQ = useQuery(superAdminQueries.brandUsage(brand.id));
  const counts = countsQ.data;
  const run = async () => {
    if (confirm.trim().toLowerCase() !== brand.slug.toLowerCase()) {
      toast.error(isAr ? "المعرّف غير مطابق" : "Slug does not match");
      return;
    }
    setWorking(true);
    if (!databasePurged) {
      const error = await deleteBrand(brand.id, hard).then(
        () => null,
        (err: { message: string }) => err,
      );
      if (error) {
        // The database purge may have completed before media cleanup failed.
        // A stale cached card remains a safe recovery handle for orphaned R2 files.
        if (hard && error.message.includes("BRAND_NOT_FOUND")) {
          setDatabasePurged(true);
        } else {
          setWorking(false);
          return toast.error(error.message);
        }
      }
      if (hard) setDatabasePurged(true);
    }
    if (hard) {
      const cleanupResults = await Promise.allSettled([
        purgeBrandPublicMedia(brand.id),
        purgeBrandPrivateReceipts({ data: { brandId: brand.id } }),
      ]);
      const failedStores = cleanupResults
        .map((result, index) =>
          result.status === "rejected" ? (index === 0 ? "public" : "private") : null,
        )
        .filter(Boolean);
      if (failedStores.length > 0) {
        console.error("Brand R2 cleanup failed", {
          brandId: brand.id,
          failedStores,
          errors: cleanupResults.map((result) =>
            result.status === "rejected" && result.reason instanceof Error
              ? result.reason.message
              : undefined,
          ),
        });
        setWorking(false);
        toast.error(
          isAr
            ? "تم حذف بيانات العلامة، لكن تعذر تنظيف ملفات R2. اضغط إعادة المحاولة."
            : `Brand data was deleted, but ${failedStores.join(" and ")} R2 cleanup failed. Click retry.`,
          { duration: 10000 },
        );
        return;
      }
    }
    setWorking(false);
    toast.success(t("brands.deleteSuccess"));
    onDone();
  };

  return (
    <DialogContent className="max-w-md bg-background/95 backdrop-blur-md border border-border-subtle text-foreground p-6 rounded-2xl shadow-xl">
      <DialogHeader>
        <DialogTitle className="text-destructive flex items-center gap-2 font-display font-bold text-lg">
          <AlertTriangle className="h-5 w-5" /> {t("brands.delete")} — {brand.name_en}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {hard
            ? isAr
              ? "سيؤدي الحذف النهائي إلى إزالة جميع المنتجات والطلبات والفواتير والعملاء والإعدادات والملفات نهائياً. لا يمكن التراجع."
              : "Permanent deletion removes all products, orders, invoices, customers, settings, and media. This cannot be undone."
            : t("brands.deleteWarning")}
        </p>
        {counts && (
          <div className="grid grid-cols-3 text-center rounded-md border border-border p-3 text-sm">
            <div>
              <div className="font-display text-lg">{counts.orders}</div>
              <div className="text-xs text-muted-foreground">{isAr ? "طلبات" : "Orders"}</div>
            </div>
            <div>
              <div className="font-display text-lg">{counts.products}</div>
              <div className="text-xs text-muted-foreground">{isAr ? "منتجات" : "Products"}</div>
            </div>
            <div>
              <div className="font-display text-lg">{counts.customers}</div>
              <div className="text-xs text-muted-foreground">{isAr ? "عملاء" : "Customers"}</div>
            </div>
          </div>
        )}
        <label className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={hard}
            onChange={(e) => setHard(e.target.checked)}
          />
          <span>{t("brands.deleteHardOption")}</span>
        </label>
        <div>
          <Label>{t("brands.deleteConfirmText")}</Label>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={brand.slug}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          variant="destructive"
          onClick={run}
          className="shadow-sm transition-all duration-200 hover:scale-[1.01] active:scale-95"
          disabled={working || confirm.trim().toLowerCase() !== brand.slug.toLowerCase()}
        >
          {working
            ? "…"
            : databasePurged
              ? isAr
                ? "إعادة محاولة تنظيف الملفات"
                : "Retry media cleanup"
              : hard
                ? isAr
                  ? "حذف كل شيء نهائياً"
                  : "Permanently delete everything"
                : isAr
                  ? "تعطيل ومسح"
                  : "Deactivate and remove"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
