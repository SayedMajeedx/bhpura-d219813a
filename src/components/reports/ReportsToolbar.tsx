import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "@/components/reports/date-range-picker";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportInterval } from "@/lib/reporting.functions";

interface ReportsToolbarProps {
  lang: "ar" | "en";
  date: DateRange | undefined;
  setDate: (date: DateRange | undefined) => void;
  includeHistorical: boolean;
  setIncludeHistorical: (include: boolean) => void;
  interval?: ReportInterval;
  setInterval?: (interval: ReportInterval) => void;
  sortBy?: string;
  setSortBy?: (sort: string) => void;
}

export function ReportsToolbar({
  lang,
  date,
  setDate,
  includeHistorical,
  setIncludeHistorical,
  interval,
  setInterval,
  sortBy,
  setSortBy,
}: ReportsToolbarProps) {
  const isAr = lang === "ar";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl shadow-2xs">
      <div className="grid min-w-0 grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:items-center">
        <div className="col-span-2 sm:contents">
          <DatePickerWithRange date={date} setDate={setDate} />
        </div>

        {(interval || sortBy) && (
          <>
            {/* Desktop Filter Popover */}
            <div className="hidden sm:block">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    aria-label={isAr ? "فتح خيارات التصفية" : "Open filter options"}
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 text-xs font-semibold bg-background"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span>{isAr ? "العرض" : "View Options"}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align={isAr ? "start" : "end"} className="w-80 space-y-3 p-4">
                  <div className="text-xs font-bold text-foreground">
                    {isAr ? "خيارات العرض" : "View Options"}
                  </div>
                  {interval && setInterval && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        {isAr ? "الفاصل الزمني" : "Interval"}
                      </label>
                      <Select
                        value={interval}
                        onValueChange={(val) => setInterval(val as ReportInterval)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-muted/30 border-border/60">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="day">{isAr ? "يومي" : "Daily"}</SelectItem>
                          <SelectItem value="week">{isAr ? "أسبوعي" : "Weekly"}</SelectItem>
                          <SelectItem value="month">{isAr ? "شهري" : "Monthly"}</SelectItem>
                          <SelectItem value="year">{isAr ? "سنوي" : "Yearly"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {sortBy && setSortBy && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        {isAr ? "ترتيب حسب" : "Sort By"}
                      </label>
                      <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="h-8 text-xs bg-muted/30 border-border/60">
                          <SelectValue placeholder={isAr ? "ترتيب حسب" : "Sort by"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="units_sold_desc">
                            {isAr ? "الأكثر مبيعاً (كمية)" : "Highest Units Sold"}
                          </SelectItem>
                          <SelectItem value="net_merch_desc">
                            {isAr ? "الأعلى قيمة (صافي البضائع)" : "Highest Net Merchandise"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Mobile Filter Sheet */}
            <div className="block sm:hidden w-full col-span-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    aria-label={isAr ? "فتح خيارات التصفية" : "Open filter options"}
                    variant="outline"
                    size="sm"
                    className="h-10 w-full gap-1.5 text-xs font-semibold bg-background justify-center"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span>{isAr ? "العرض" : "View Options"}</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="p-4 space-y-4">
                  <SheetHeader>
                    <SheetTitle className="text-sm font-bold">
                      {isAr ? "خيارات العرض" : "View Options"}
                    </SheetTitle>
                  </SheetHeader>
                  <div className="space-y-3">
                    {interval && setInterval && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          {isAr ? "الفاصل الزمني" : "Interval"}
                        </label>
                        <Select
                          value={interval}
                          onValueChange={(val) => setInterval(val as ReportInterval)}
                        >
                          <SelectTrigger className="h-9 text-xs bg-muted/30 border-border/60">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="day">{isAr ? "يومي" : "Daily"}</SelectItem>
                            <SelectItem value="week">{isAr ? "أسبوعي" : "Weekly"}</SelectItem>
                            <SelectItem value="month">{isAr ? "شهري" : "Monthly"}</SelectItem>
                            <SelectItem value="year">{isAr ? "سنوي" : "Yearly"}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {sortBy && setSortBy && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">
                          {isAr ? "ترتيب حسب" : "Sort By"}
                        </label>
                        <Select value={sortBy} onValueChange={setSortBy}>
                          <SelectTrigger className="h-9 text-xs bg-muted/30 border-border/60">
                            <SelectValue placeholder={isAr ? "ترتيب حسب" : "Sort by"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="units_sold_desc">
                              {isAr ? "الأكثر مبيعاً (كمية)" : "Highest Units Sold"}
                            </SelectItem>
                            <SelectItem value="net_merch_desc">
                              {isAr ? "الأعلى قيمة (صافي البضائع)" : "Highest Net Merchandise"}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </>
        )}
      </div>

      <div className="flex min-h-10 items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-2 py-1">
        <Switch
          id="historical-toggle"
          checked={includeHistorical}
          onCheckedChange={setIncludeHistorical}
        />
        <Label
          htmlFor="historical-toggle"
          className="text-xs font-medium cursor-pointer select-none"
        >
          {isAr ? "تضمين الطلبات المؤرشفة" : "Include Archived Orders"}
        </Label>
      </div>
    </div>
  );
}
