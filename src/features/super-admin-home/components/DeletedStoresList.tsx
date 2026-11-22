import { Archive } from "lucide-react";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { OsStatusPill } from "@/components/os/os-status-pill";
import type { DeletedStore } from "../lib/deleted-stores";

type Lang = "ar" | "en";

const momentOf = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleString(lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** The stores that were deleted: which, when, by whom, and whether their data went with them. */
export function DeletedStoresList({ stores, lang }: { stores: DeletedStore[]; lang: Lang }) {
  const ar = lang === "ar";
  if (stores.length === 0) {
    return (
      <OsEmptyState
        icon={Archive}
        title={ar ? "لا متاجر محذوفة" : "No deleted stores"}
        description={
          ar
            ? "يُسجَّل هنا كل متجر يُحذف من اليوم: اسمه ورابطه ومتى ومن حذفه."
            : "Every store deleted from today is recorded here: its name, address, when and by whom."
        }
      />
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {ar
          ? "المتاجر المحذوفة نهائياً حُذفت مع بياناتها، ولا يبقى منها إلا هذا السجل."
          : "Stores removed for good went with their data; only this record is left of them."}
      </p>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {stores.map((store) => (
          <li
            key={store.id}
            className="flex flex-wrap items-start justify-between gap-2 p-3 sm:px-4"
          >
            <div className="min-w-0">
              <div dir="auto" className="text-page-start break-words text-sm font-semibold">
                {(ar ? store.nameAr || store.nameEn : store.nameEn || store.nameAr) || store.slug}
              </div>
              <div className="font-mono text-xs text-muted-foreground" dir="ltr">
                {store.slug}.boutq.store
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {store.deletedAt
                  ? momentOf(store.deletedAt, lang)
                  : ar
                    ? "وقت الحذف غير معروف"
                    : "Time unknown"}
                {store.deletedBy && (
                  <>
                    {" · "}
                    <span dir="ltr">{store.deletedBy}</span>
                  </>
                )}
              </div>
            </div>
            <OsStatusPill variant={store.mode === "hard" ? "destructive" : "neutral"}>
              {store.mode === "hard"
                ? ar
                  ? "حُذف مع بياناته"
                  : "Removed with its data"
                : ar
                  ? "مخفي، بياناته باقية"
                  : "Hidden, data kept"}
            </OsStatusPill>
          </li>
        ))}
      </ul>
    </div>
  );
}
