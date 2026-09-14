import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type SizeGuide, type SizeGuideUnit } from "../../../lib/size-guide";
import { SizeGuidePanel } from "./SizeGuidePanel";
import { useI18n } from "@/lib/i18n";

export interface SizeGuideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guide: SizeGuide;
  selectedSize?: string | null;
  onSelectSize?: (size: string) => void;
  initialUnit?: SizeGuideUnit;
}

export function SizeGuideModal({
  open,
  onOpenChange,
  guide,
  selectedSize,
  onSelectSize,
  initialUnit,
}: SizeGuideModalProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const handleSelect = (size: string) => {
    if (onSelectSize) {
      onSelectSize(size);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            {isAr ? "دليل المقاسات" : "Size Guide"}
          </DialogTitle>
        </DialogHeader>
        <div className="pt-2">
          <SizeGuidePanel
            guide={guide}
            selectedSize={selectedSize}
            onSelectSize={onSelectSize ? handleSelect : undefined}
            initialUnit={initialUnit}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
