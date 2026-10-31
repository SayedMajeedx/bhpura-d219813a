import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { OsLoadFailedState, combinedLoadState } from "@/components/os/os-load-failed-state";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { moneyFractionDigits } from "@/lib/format";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { reportingQueries } from "@/lib/data/reporting";
import { cn } from "@/lib/utils";
import {
  STATEMENT_PRESETS,
  changeFigure,
  columnsIn,
  currenciesIn,
  lineFigure,
  monthLabel,
  presetMonths,
  statementLines,
  yearEarlier,
  type StatementLine,
  type StatementPreset,
} from "../lib/statement";
import { STATEMENT_WORDS, statementSheet } from "../lib/statement-sheet";
import {
  GIFT_CARD_SECTION,
  giftCardStatementLines,
  readGiftCardReport,
} from "../lib/gift-card-report";
import { downloadWorkbook, workbookFileName } from "../lib/workbook";
import { MonthPackDialog } from "./MonthPackDialog";

const PRESET_WORDS: Record<StatementPreset, { en: string; ar: string }> = {
  last12: { en: "Last 12 months", ar: "آخر 12 شهراً" },
  last6: { en: "Last 6 months", ar: "آخر 6 أشهر" },
  thisYear: { en: "This year", ar: "هذه السنة" },
  lastYear: { en: "Last year", ar: "السنة الماضية" },
};

/**
 * The monthly statement: the overview's figures month by month, as a profit and loss statement,
 * with the months' total and the same months a year earlier, and an Excel copy for the
 * accountant. One request for every month (`rpc_reporting_periods`).
 */
export function MonthlyStatementPage({ slug }: { slug: string }) {
  const { lang: rawLang } = useI18n();
  const lang = rawLang === "ar" ? "ar" : "en";
  const isAr = lang === "ar";
  const brand = useBrand();
  const storeCurrency = useStoreCurrency(brand.id);
  const [preset, setPreset] = useState<StatementPreset>("last12");
  const [compare, setCompare] = useState(true);
  const [chosenCurrency, setChosenCurrency] = useState("");
  const [saving, setSaving] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const months = useMemo(() => presetMonths(preset), [preset]);
  const priorMonths = useMemo(() => yearEarlier(months), [months]);
  const ranges = useMemo(
    () => [...months, ...(compare ? priorMonths : [])].map((m) => ({ from: m.from, to: m.to })),
    [months, priorMonths, compare],
  );
  const query = useQuery({ ...reportingQueries.periods(slug, ranges, timeZone, false), retry: 1 });
  const current = useMemo(() => (query.data ?? []).slice(0, months.length), [query.data, months]);
  const prior = useMemo(
    () => (compare ? (query.data ?? []).slice(months.length) : null),
    [query.data, months, compare],
  );
  const currencies = useMemo(
    () => currenciesIn([...current, ...(prior ?? [])], storeCurrency),
    [current, prior, storeCurrency],
  );
  const currency = currencies.includes(chosenCurrency) ? chosenCurrency : currencies[0];
  const digits = moneyFractionDigits(currency);
  // Gift cards are money held, not sales (step three): their own lines, in the store's currency.
  const giftCards = useQuery({ ...reportingQueries.giftCards(slug, ranges), retry: 1 });
  const lines = useMemo(() => {
    const money = statementLines(
      columnsIn(current, currency),
      prior ? columnsIn(prior, currency) : null,
    );
    if (currency !== storeCurrency || !giftCards.data) return money;
    const cards = readGiftCardReport(giftCards.data).periods;
    return [
      ...money,
      ...giftCardStatementLines(
        cards.slice(0, months.length),
        compare ? cards.slice(months.length) : null,
      ),
    ];
  }, [current, prior, currency, storeCurrency, giftCards.data, months, compare]);
  const storeName = (isAr ? brand.name_ar : null) || brand.name_en;

  const download = async () => {
    setSaving(true);
    try {
      const first = months[0];
      const last = months[months.length - 1];
      await downloadWorkbook(
        [statementSheet({ lines, months, currency, digits, lang, storeName, timeZone, compare })],
        workbookFileName(slug, "statement", `${first.key}-to-${last.key}`),
      );
    } catch {
      toast.error(isAr ? "تعذر تنزيل الملف" : "The file could not be downloaded");
    } finally {
      setSaving(false);
    }
  };

  const state = combinedLoadState([query]);

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-end gap-3 p-3 sm:p-4">
        <div className="min-w-0 flex-1 basis-56">
          <h2 className="text-base font-bold">{STATEMENT_WORDS.title[lang]}</h2>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `المبالغ بعملة ${currency}، الأشهر بتوقيت ${timeZone}.`
              : `Amounts in ${currency}; months on ${timeZone} time.`}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="statement-period" className="text-xs">
            {isAr ? "الفترة" : "Period"}
          </Label>
          <select
            id="statement-period"
            value={preset}
            onChange={(e) => setPreset(e.target.value as StatementPreset)}
            className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11"
          >
            {STATEMENT_PRESETS.map((p) => (
              <option key={p} value={p}>
                {PRESET_WORDS[p][lang]}
              </option>
            ))}
          </select>
        </div>
        {currencies.length > 1 && (
          <div className="space-y-1">
            <Label htmlFor="statement-currency" className="text-xs">
              {isAr ? "العملة" : "Currency"}
            </Label>
            <select
              id="statement-currency"
              value={currency}
              onChange={(e) => setChosenCurrency(e.target.value)}
              className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm pointer-coarse:h-11"
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex h-9 items-center gap-2 pointer-coarse:h-11">
          <Switch id="statement-compare" checked={compare} onCheckedChange={setCompare} />
          <Label htmlFor="statement-compare" className="text-sm font-normal">
            {STATEMENT_WORDS.lastYear[lang]}
          </Label>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={download}
          disabled={saving || state !== "ready"}
          className="gap-1.5"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {isAr ? "تنزيل Excel" : "Download Excel"}
        </Button>
        <MonthPackDialog slug={slug} currency={currency} lang={lang} />
      </Card>

      {state === "failed" ? (
        <OsLoadFailedState
          isAr={isAr}
          title={isAr ? "تعذّر تحميل القائمة" : "The statement could not be loaded"}
          description={
            isAr
              ? "لم يتغير شيء. تحقق من الاتصال ثم أعد المحاولة."
              : "Nothing was changed. Check the connection and try again."
          }
          queries={[query]}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-max border-collapse text-sm tabular-nums"
              aria-busy={state === "loading"}
            >
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="sticky start-0 z-10 bg-card px-3 py-2 text-start text-xs font-semibold text-muted-foreground"
                  >
                    {currency}
                  </th>
                  {months.map((m) => (
                    <th
                      key={m.key}
                      scope="col"
                      className="whitespace-nowrap px-3 py-2 text-end text-xs font-semibold"
                    >
                      {monthLabel(m, lang)}
                      {m.toDate && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {STATEMENT_WORDS.toDate[lang]}
                        </span>
                      )}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="whitespace-nowrap bg-muted/40 px-3 py-2 text-end text-xs font-bold"
                  >
                    {STATEMENT_WORDS.total[lang]}
                  </th>
                  {compare && (
                    <>
                      <th
                        scope="col"
                        className="whitespace-nowrap px-3 py-2 text-end text-xs font-semibold text-muted-foreground"
                      >
                        {STATEMENT_WORDS.lastYear[lang]}
                      </th>
                      <th
                        scope="col"
                        className="whitespace-nowrap px-3 py-2 text-end text-xs font-semibold text-muted-foreground"
                      >
                        {STATEMENT_WORDS.change[lang]}
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {state === "loading" ? (
                  <tr>
                    <td
                      colSpan={months.length + (compare ? 4 : 2)}
                      className="px-3 py-10 text-center text-sm text-muted-foreground"
                    >
                      {isAr ? "جارٍ تحميل الأشهر…" : "Loading the months…"}
                    </td>
                  </tr>
                ) : (
                  lines.map((line, index) => (
                    <StatementRow
                      key={line.key}
                      line={line}
                      digits={digits}
                      lang={lang}
                      compare={compare}
                      startsReference={Boolean(line.reference && !lines[index - 1]?.reference)}
                      startsGiftCards={Boolean(
                        line.section === "gift_cards" && !lines[index - 1]?.section,
                      )}
                      span={months.length + (compare ? 4 : 2)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="px-1 text-xs text-muted-foreground">{STATEMENT_WORDS.basis[lang]}</p>
    </div>
  );
}

function StatementRow({
  line,
  digits,
  lang,
  compare,
  startsReference,
  startsGiftCards = false,
  span,
}: {
  line: StatementLine;
  digits: number;
  lang: "ar" | "en";
  compare: boolean;
  startsReference: boolean;
  startsGiftCards?: boolean;
  span: number;
}) {
  const strong = line.kind === "subtotal" || line.kind === "total";
  const muted = line.kind === "ratio";
  const loss = line.kind === "total" && line.total < 0;
  const cell = (value: number) => lineFigure(line.kind, value, digits);
  return (
    <>
      {startsReference && (
        <tr>
          <td colSpan={span} className="px-3 pb-1 pt-4 text-xs font-bold text-muted-foreground">
            {STATEMENT_WORDS.reference[lang]}
          </td>
        </tr>
      )}
      {startsGiftCards && (
        <tr>
          <td colSpan={span} className="px-3 pb-1 pt-4 text-xs font-bold text-muted-foreground">
            {GIFT_CARD_SECTION[lang]}
          </td>
        </tr>
      )}
      <tr
        className={cn(
          strong && "border-t border-border font-semibold",
          line.kind === "total" && "border-t-2 font-bold",
          muted && "text-xs text-muted-foreground",
          line.warning && line.total > 0 && "text-warning",
        )}
      >
        <th
          scope="row"
          className={cn(
            "sticky start-0 z-10 bg-card px-3 py-1.5 text-start font-[inherit]",
            (line.kind === "item" || muted) && "ps-6",
          )}
        >
          <span className="block w-32 whitespace-normal sm:w-56">{line.label[lang]}</span>
        </th>
        {line.values.map((value, i) => (
          <td
            key={i}
            className={cn(
              "whitespace-nowrap px-3 py-1.5 text-end",
              loss && value < 0 && "text-destructive",
            )}
          >
            {cell(value)}
          </td>
        ))}
        <td
          className={cn(
            "whitespace-nowrap bg-muted/40 px-3 py-1.5 text-end font-semibold",
            loss && "text-destructive",
          )}
        >
          {cell(line.total)}
        </td>
        {compare && (
          <>
            <td className="whitespace-nowrap px-3 py-1.5 text-end text-muted-foreground">
              {line.prior === null ? "–" : cell(line.prior)}
            </td>
            <td className="whitespace-nowrap px-3 py-1.5 text-end text-muted-foreground">
              {changeFigure(line.kind, line.change, lang)}
            </td>
          </>
        )}
      </tr>
    </>
  );
}
