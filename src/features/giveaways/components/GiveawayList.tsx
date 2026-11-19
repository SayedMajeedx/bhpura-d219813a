import { Loader2, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/lib/brand-context";
import { deleteGiveaway, giveawaysQueries, invalidateGiveaways } from "@/lib/data/giveaways";
import { AppConfirm } from "@/components/ui/app-confirm";
import { useState } from "react";

const STATUS_LABEL: Record<string, { en: string; ar: string }> = {
  draft: { en: "Draft", ar: "مسودة" },
  fetching: { en: "Pulling comments", ar: "جارٍ سحب التعليقات" },
  ready: { en: "Ready to draw", ar: "جاهزة للسحب" },
  drawn: { en: "Drawn", ar: "تم السحب" },
};

/** The store's giveaways, newest first. */
export function GiveawayList({ isAr, onOpen }: { isAr: boolean; onOpen: (id: string) => void }) {
  const brand = useBrand();
  const qc = useQueryClient();
  const list = useQuery(giveawaysQueries.list(brand.id));
  const remove = useMutation({
    mutationFn: (id: string) => deleteGiveaway(brand.id, id),
    onSuccess: () => invalidateGiveaways(qc, brand.id),
    onError: () => toast.error(isAr ? "تعذر حذف المسابقة." : "Could not delete the giveaway."),
  });

  if (list.isLoading) {
    return (
      <div className="flex h-24 items-center justify-center" role="status">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const rows = list.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {isAr ? "لا توجد مسابقات بعد." : "No giveaways yet."}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const label = STATUS_LABEL[row.status] ?? STATUS_LABEL.draft;
        return (
          <li
            key={row.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-2"
          >
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpen(row.id)}
              className="h-auto min-w-0 flex-1 justify-start gap-3 whitespace-normal p-0 text-start font-normal hover:bg-transparent"
            >
              <span className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                {row.media_thumbnail_url && (
                  <img
                    src={row.media_thumbnail_url}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{row.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleDateString(isAr ? "ar-BH-u-nu-latn" : "en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </span>
              <Badge variant={row.status === "drawn" ? "default" : "secondary"}>
                {isAr ? label.ar : label.en}
              </Badge>
            </Button>
            <DeleteGiveawayButton isAr={isAr} onDelete={() => remove.mutate(row.id)} />
          </li>
        );
      })}
    </ul>
  );
}

/** The bin on a giveaway's row, which asks first: its comments and winners go with it. */
function DeleteGiveawayButton({ isAr, onDelete }: { isAr: boolean; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={isAr ? "حذف المسابقة" : "Delete giveaway"}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
      </Button>
      <AppConfirm
        open={open}
        onOpenChange={setOpen}
        dir={isAr ? "rtl" : "ltr"}
        title={isAr ? "حذف المسابقة؟" : "Delete this giveaway?"}
        description={
          isAr
            ? "تُحذف التعليقات المسحوبة والفائزون المحفوظون ولا يمكن التراجع."
            : "The pulled comments and the saved winners are deleted. This cannot be undone."
        }
        destructive
        confirmLabel={isAr ? "حذف" : "Delete"}
        cancelLabel={isAr ? "إلغاء" : "Cancel"}
        onConfirm={onDelete}
      />
    </>
  );
}
