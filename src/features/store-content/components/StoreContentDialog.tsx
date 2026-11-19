import { useState } from "react";
import { Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FaqEditor } from "@/features/store-content/components/FaqEditor";
import { GalleryEditor } from "@/features/store-content/components/GalleryEditor";
import { AppDialog, AppDialogBody, AppDialogHeader } from "@/components/ui/app-dialog";

/** The store's gallery pictures and FAQ, edited in one place. */
export function StoreContentDialog({
  brandId,
  isAr,
  open,
  onOpenChange,
}: {
  brandId: string;
  isAr: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<"gallery" | "faq">("gallery");
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      kind="form"
      size="lg"
      dir={isAr ? "rtl" : "ltr"}
    >
      <AppDialogHeader
        title={
          <>
            <Images className="size-4 text-primary" aria-hidden="true" />
            {isAr ? "المعرض والأسئلة الشائعة" : "Gallery and FAQ"}
          </>
        }
        description={
          isAr
            ? "صور مناسباتك السابقة وأسئلة عملائك المتكررة، تظهر في صفحة الحجز."
            : "Pictures of your past events and the questions customers ask; they show on the booking page."
        }
      />

      <AppDialogBody>
        <div className="flex gap-2" role="tablist" aria-label={isAr ? "القسم" : "Section"}>
          {(["gallery", "faq"] as const).map((id) => (
            <Button
              key={id}
              type="button"
              role="tab"
              size="sm"
              aria-selected={tab === id}
              variant={tab === id ? "default" : "outline"}
              onClick={() => setTab(id)}
            >
              {id === "gallery" ? (isAr ? "المعرض" : "Gallery") : isAr ? "الأسئلة الشائعة" : "FAQ"}
            </Button>
          ))}
        </div>
        {tab === "gallery" ? (
          <GalleryEditor brandId={brandId} isAr={isAr} />
        ) : (
          <FaqEditor brandId={brandId} isAr={isAr} />
        )}
      </AppDialogBody>
    </AppDialog>
  );
}
