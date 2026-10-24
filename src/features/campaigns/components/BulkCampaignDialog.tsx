import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Check, Megaphone, Play, Pause, Square, ExternalLink, ShieldCheck } from "lucide-react";

import type { BulkStatus } from "@/features/campaigns/lib/campaign-shared";
import type { CampaignsPageState } from "@/features/campaigns/hooks/use-campaigns-page";

/** The bulk sender: one chat after another, by hand or with a pause between them. */
export function BulkCampaignDialog({ page }: { page: CampaignsPageState }) {
  const {
    isAr,
    bulkOpen,
    setBulkOpen,
    bulkMode,
    setBulkMode,
    bulkActive,
    setBulkActive,
    bulkIndex,
    setBulkIndex,
    bulkDelay,
    setBulkDelay,
    bulkQueue,
    bulkSent,
    setBulkSent,
    handleStartAutomated,
    sendGuidedNext,
  } = page;
  return (
    <>
      {/* IMMERSIVE BULK CAMPAIGN SENDER MODAL */}
      <Dialog
        open={bulkOpen}
        onOpenChange={(v) => {
          if (!bulkActive) setBulkOpen(v);
        }}
      >
        <DialogContent
          className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden"
          dir={isAr ? "rtl" : "ltr"}
        >
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded bg-emerald-500/10 text-emerald-600 flex items-center justify-center animate-bounce">
                <Megaphone className="h-4.5 w-4.5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-display">
                  {isAr ? "مساعد الإرسال الجماعي" : "Bulk Campaign Wizard"}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? `إرسال إلى العملاء المحددين: ${bulkQueue.length}.`
                    : `Targeting ${bulkQueue.length} segments.`}
                </p>
              </div>
            </div>
            {bulkActive && (
              <span className="flex items-center gap-1.5 text-xs bg-amber-500/15 text-amber-700 px-2 py-1 rounded-full font-medium animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {isAr ? "جارٍ البث..." : "Broadcasting..."}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Mode selection tabs */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">
                {isAr ? "طريقة التشغيل" : "Sender Mode"}
              </Label>
              <div className="grid grid-cols-2 gap-2 mt-2 p-1 bg-secondary rounded-lg">
                <button
                  onClick={() => {
                    if (!bulkActive) setBulkMode("guided");
                  }}
                  disabled={bulkActive}
                  className={`py-2 px-3 text-sm rounded-md font-medium transition-all ${bulkMode === "guided" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {isAr ? "توجيه خطوة بخطوة" : "Guided Step-by-Step"}
                </button>
                <button
                  onClick={() => {
                    if (!bulkActive) setBulkMode("auto");
                  }}
                  disabled={bulkActive}
                  className={`py-2 px-3 text-sm rounded-md font-medium transition-all ${bulkMode === "auto" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {isAr ? "إرسال تلقائي متسلسل" : "Automated Queue Loop"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {bulkMode === "guided"
                  ? isAr
                    ? "💡 ينصح به لتخطي حواجب منبثقات المتصفح بالكامل. اضغط لفتح المحادثة التالية فوراً."
                    : "💡 Recommended mode. 100% bypasses popup-blockers and lets you review before sending."
                  : isAr
                    ? "⚡ يقوم النظام بفتح المحادثات تلو الأخرى تلقائياً. تأكد من تفعيل المنبثقات في المتصفح."
                    : "⚡ Sequentially opens WhatsApp Web tabs automatically. Please enable popups in your browser address bar."}
              </p>
            </div>

            {/* Config & Notices for Auto Mode */}
            {bulkMode === "auto" && (
              <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">
                      {isAr ? "تأخير الفتح التلقائي (بالثانية)" : "Queue Delay (Seconds)"}
                    </Label>
                    <div className="text-xs text-muted-foreground">
                      {isAr
                        ? "المهلة الفاصلة بين فتح كل علامة تبويب."
                        : "Time elapsed between each browser window trigger."}
                    </div>
                  </div>
                  <Select
                    value={String(bulkDelay)}
                    onValueChange={(v) => setBulkDelay(Number(v))}
                    disabled={bulkActive}
                  >
                    <SelectTrigger className="w-28 text-center font-mono font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1500">1.5s</SelectItem>
                      <SelectItem value="2500">2.5s</SelectItem>
                      <SelectItem value="4000">4.0s</SelectItem>
                      <SelectItem value="6000">6.0s</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-start gap-2 text-xs border border-amber-200/50 bg-amber-50/50 p-2.5 rounded text-amber-800 dark:border-amber-900/20 dark:bg-amber-950/10 dark:text-amber-300">
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {isAr
                      ? "يرجى البقاء في هذه الصفحة وتفعيل خيار 'سماح بالنوافذ المنبثقة' من شريط العنوان لتتمكن الحملة من إتمام الإرسال تلقائياً دون تجميد."
                      : "Keep this tab visible and verify you've granted Popups Permission in your browser search/address bar for a smooth flow."}
                  </span>
                </div>
              </div>
            )}

            {/* Progress Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-muted-foreground">
                  {isAr ? "مستوى تقدم البث:" : "Campaign Progress:"}
                </span>
                <span className="font-mono font-bold text-primary">
                  {bulkIndex} / {bulkQueue.length}
                </span>
              </div>
              <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                  style={{ width: `${(bulkIndex / bulkQueue.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Recipient Queue Grid */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                {isAr ? "قائمة المستلمين وقنواتهم" : "Recipient List Queue"}
              </Label>
              <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto divide-y">
                {bulkQueue.map((c, idx) => {
                  const status = bulkSent[c.id] || "queued";
                  return (
                    <div
                      key={c.id}
                      className={`p-2.5 flex items-center justify-between text-xs transition-colors ${idx === bulkIndex ? "bg-primary/5 font-semibold" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono w-5">#{idx + 1}</span>
                        <div>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-muted-foreground text-xs font-mono" dir="ltr">
                            {c.phone}
                          </div>
                        </div>
                      </div>
                      <div>
                        {status === "queued" && (
                          <span className="text-muted-foreground bg-muted/60 px-2 py-0.5 rounded text-xs font-medium">
                            {isAr ? "في الانتظار" : "Queued"}
                          </span>
                        )}
                        {status === "sending" && (
                          <span className="text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded text-xs font-medium animate-pulse">
                            {isAr ? "جاري الإرسال" : "Sending..."}
                          </span>
                        )}
                        {status === "sent" && (
                          <span className="text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1">
                            <Check className="h-2.5 w-2.5" />
                            {isAr ? "تم فتح الشات" : "Opened"}
                          </span>
                        )}
                        {status === "skipped" && (
                          <span className="text-destructive bg-destructive/10 px-2 py-0.5 rounded text-xs font-medium">
                            {isAr ? "تخطي" : "Skipped"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setBulkActive(false);
                setBulkOpen(false);
              }}
              disabled={bulkActive}
            >
              {isAr ? "إغلاق النافذة" : "Cancel Wizard"}
            </Button>

            <div className="flex items-center gap-2">
              {bulkMode === "guided" ? (
                <Button
                  onClick={sendGuidedNext}
                  disabled={bulkIndex >= bulkQueue.length}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                >
                  <ExternalLink className="h-4 w-4 me-1.5" />
                  {bulkIndex === 0
                    ? isAr
                      ? "بدء الإرسال (التالي)"
                      : "Start Send Next"
                    : isAr
                      ? "فتح الشات التالي"
                      : "Open Next Chat"}
                </Button>
              ) : (
                <>
                  {bulkActive ? (
                    <Button
                      onClick={() => setBulkActive(false)}
                      variant="outline"
                      className="border-amber-200 text-amber-800 bg-amber-50 hover:bg-amber-100 flex items-center gap-1.5 font-medium"
                    >
                      <Pause className="h-4 w-4" />
                      {isAr ? "إيقاف مؤقت" : "Pause Queue"}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleStartAutomated}
                      disabled={bulkIndex >= bulkQueue.length}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5"
                    >
                      <Play className="h-4 w-4" />
                      {bulkIndex === 0
                        ? isAr
                          ? "بدء الإرسال التلقائي"
                          : "Start Automated Send"
                        : isAr
                          ? "استئناف"
                          : "Resume Queue"}
                    </Button>
                  )}
                  {bulkIndex > 0 && (
                    <Button
                      onClick={() => {
                        setBulkActive(false);
                        setBulkIndex(0);
                        const initialSent: Record<string, BulkStatus> = {};
                        bulkQueue.forEach((c) => {
                          initialSent[c.id] = "queued";
                        });
                        setBulkSent(initialSent);
                      }}
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Square className="h-4 w-4 text-destructive me-1.5" />
                      {isAr ? "إعادة تعيين" : "Reset"}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
