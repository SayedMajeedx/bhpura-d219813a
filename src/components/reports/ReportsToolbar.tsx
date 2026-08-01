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
      <div className="flex flex-wrap items-center gap-2.5">
        <DatePickerWithRange date={date} setDate={setDate} />

        {interval && setInterval && (
          <Select value={interval} onValueChange={(val) => setInterval(val as ReportInterval)}>
            <SelectTrigger className="h-9 w-[130px] bg-background text-xs font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">{isAr ? "يومي" : "Daily"}</SelectItem>
              <SelectItem value="week">{isAr ? "أسبوعي" : "Weekly"}</SelectItem>
              <SelectItem value="month">{isAr ? "شهري" : "Monthly"}</SelectItem>
              <SelectItem value="year">{isAr ? "سنوي" : "Yearly"}</SelectItem>
            </SelectContent>
          </Select>
        )}

        {sortBy && setSortBy && (
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-9 w-[190px] bg-background text-xs font-semibold">
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
        )}
      </div>

      <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-muted/30 border border-border/40">
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
