import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Ruler, Sparkles, Info, Check } from "lucide-react";

interface SizeRow {
  size: string;
  lengthIn: number;
  bustIn: number;
  sleeveIn: number;
  shoulderIn: number;
}

const DEFAULT_ABAYA_SIZES: SizeRow[] = [
  { size: "50", lengthIn: 50, bustIn: 20, sleeveIn: 25, shoulderIn: 14.5 },
  { size: "52", lengthIn: 52, bustIn: 21, sleeveIn: 26, shoulderIn: 15 },
  { size: "54", lengthIn: 54, bustIn: 22, sleeveIn: 27, shoulderIn: 15.5 },
  { size: "56", lengthIn: 56, bustIn: 23, sleeveIn: 28, shoulderIn: 16 },
  { size: "58", lengthIn: 58, bustIn: 24, sleeveIn: 29, shoulderIn: 16.5 },
  { size: "60", lengthIn: 60, bustIn: 25, sleeveIn: 30, shoulderIn: 17 },
];

function inToCm(val: number): number {
  return Math.round(val * 2.54);
}

interface SizeGuideModalProps {
  isAr: boolean;
  productName?: string;
  onSelectSize?: (size: string) => void;
  selectedSize?: string | null;
  children?: React.ReactNode;
}

export function SizeGuideModal({
  isAr,
  productName,
  onSelectSize,
  selectedSize,
  children,
}: SizeGuideModalProps) {
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<"in" | "cm">("in");

  const title = isAr ? "دليل المقاسات والقياسات" : "Size & Measurement Guide";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Ruler className="h-3.5 w-3.5" />
            <span>{isAr ? "دليل المقاسات" : "Size Guide"}</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className="max-w-xl max-h-[90vh] overflow-y-auto p-4 sm:p-6"
        dir={isAr ? "rtl" : "ltr"}
      >
        <DialogHeader className="text-start pb-2 border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-lg sm:text-xl font-display flex items-center gap-2">
                <Ruler className="h-5 w-5 text-primary" />
                <span>{title}</span>
              </DialogTitle>
              {productName && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{productName}</p>
              )}
            </div>

            {/* Unit Switcher */}
            <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setUnit("in")}
                className={`rounded-md px-2.5 py-1 transition-all ${
                  unit === "in"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isAr ? "إنش (In)" : "Inches"}
              </button>
              <button
                type="button"
                onClick={() => setUnit("cm")}
                className={`rounded-md px-2.5 py-1 transition-all ${
                  unit === "cm"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isAr ? "سم (CM)" : "CM"}
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Sizing Table */}
        <div className="mt-4 space-y-4">
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-start text-xs sm:text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="py-2.5 px-3 text-start font-semibold">
                    {isAr ? "المقاس" : "Size"}
                  </th>
                  <th className="py-2.5 px-3 text-center font-semibold">
                    {isAr ? "الطول" : "Length"} ({unit === "in" ? (isAr ? "إنش" : "in") : (isAr ? "سم" : "cm")})
                  </th>
                  <th className="py-2.5 px-3 text-center font-semibold">
                    {isAr ? "محيط الصدر" : "Bust"} ({unit === "in" ? (isAr ? "إنش" : "in") : (isAr ? "سم" : "cm")})
                  </th>
                  <th className="py-2.5 px-3 text-center font-semibold">
                    {isAr ? "طول الكم" : "Sleeve"} ({unit === "in" ? (isAr ? "إنش" : "in") : (isAr ? "سم" : "cm")})
                  </th>
                  <th className="py-2.5 px-3 text-center font-semibold">
                    {isAr ? "عرض الكتف" : "Shoulder"} ({unit === "in" ? (isAr ? "إنش" : "in") : (isAr ? "سم" : "cm")})
                  </th>
                  {onSelectSize && (
                    <th className="py-2.5 px-3 text-center font-semibold">
                      {isAr ? "اختيار" : "Select"}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {DEFAULT_ABAYA_SIZES.map((row) => {
                  const isSelected = selectedSize === row.size;
                  return (
                    <tr
                      key={row.size}
                      className={`transition-colors ${
                        isSelected ? "bg-primary/5 font-semibold text-primary" : "hover:bg-muted/30"
                      }`}
                    >
                      <td className="py-2.5 px-3 text-start font-bold">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{row.size}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-primary stroke-[3]" />}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium">
                        {unit === "in" ? row.lengthIn : inToCm(row.lengthIn)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium">
                        {unit === "in" ? row.bustIn : inToCm(row.bustIn)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium">
                        {unit === "in" ? row.sleeveIn : inToCm(row.sleeveIn)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium">
                        {unit === "in" ? row.shoulderIn : inToCm(row.shoulderIn)}
                      </td>
                      {onSelectSize && (
                        <td className="py-2.5 px-3 text-center">
                          <Button
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs px-2.5 rounded-md"
                            onClick={() => {
                              onSelectSize(row.size);
                              setOpen(false);
                            }}
                          >
                            {isSelected
                              ? isAr
                                ? "مختار"
                                : "Selected"
                              : isAr
                                ? "اختر"
                                : "Select"}
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Sizing Tips & How to Measure Box */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-2.5 text-xs sm:text-sm">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Info className="h-4 w-4 text-primary" />
              <span>{isAr ? "كيفية أخذ القياسات بدقة:" : "How to measure accurately:"}</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs leading-relaxed ps-1">
              <li>
                <strong className="text-foreground">{isAr ? "الطول:" : "Length:"}</strong>{" "}
                {isAr
                  ? "يُقاس من أعلى الكتف عند الرقبة نزولاً حتى الكعبين أو الطول المطلوب."
                  : "Measure from top of the shoulder down to your desired length."}
              </li>
              <li>
                <strong className="text-foreground">{isAr ? "محيط الصدر:" : "Bust:"}</strong>{" "}
                {isAr
                  ? "يُقاس محيط الصدر من أوسع نقطة مع إبقاء شريط القياس مريحاً."
                  : "Measure around the fullest part of your bust keeping tape comfortably loose."}
              </li>
              <li>
                <strong className="text-foreground">{isAr ? "طول الكم:" : "Sleeve:"}</strong>{" "}
                {isAr
                  ? "يُقاس من عظمة الكتف نزولاً حتى معصم اليد."
                  : "Measure from the shoulder bone down to your wrist."}
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
