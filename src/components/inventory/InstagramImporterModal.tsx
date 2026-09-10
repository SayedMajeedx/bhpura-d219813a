import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Instagram,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
  Video,
  Layers,
  ChevronRight,
  Info,
  ExternalLink,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  fetchInstagramPosts,
  checkScraperStatus,
  fetchScraperDataset,
  batchRehostAllMedia,
  batchParseCaptionsWithAI,
  retryImageRehostFn,
  bulkInsertProducts,
  RATE_LIMIT_INFO,
  type InstagramPostPreview,
  type InstagramProductDraft,
} from "@/lib/instagram-ai-importer";

export interface InstagramImporterModalProps {
  brandId: string;
  onComplete: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

type Step = "input" | "scraping" | "rehosting" | "analyzing" | "review" | "saving" | "success";
type FilterTab = "all" | "ready" | "needs_review" | "image_failed";

export function InstagramImporterModal({
  brandId,
  onComplete,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  trigger,
}: InstagramImporterModalProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const setIsOpen = (val: boolean) => {
    if (isControlled) {
      setControlledOpen?.(val);
    } else {
      setInternalOpen(val);
    }
  };

  const [step, setStep] = React.useState<Step>("input");

  React.useEffect(() => {
    if (isOpen && step === "success") {
      setStep("input");
      setStatusMessage("");
      setProgressPercent(0);
    }
  }, [isOpen]);

  // Inputs
  const [username, setUsername] = React.useState("");
  const [urlsText, setUrlsText] = React.useState("");
  const [limit, setLimit] = React.useState(15);
  const [showRateLimitDoc, setShowRateLimitDoc] = React.useState(false);

  // Execution states
  const [statusMessage, setStatusMessage] = React.useState("");
  const [progressPercent, setProgressPercent] = React.useState(0);
  const [retryingImageId, setRetryingImageId] = React.useState<string | null>(null);

  // Review & Drafts state
  const [drafts, setDrafts] = React.useState<InstagramProductDraft[]>([]);
  const [filterTab, setFilterTab] = React.useState<FilterTab>("all");
  const [importResult, setImportResult] = React.useState<{ success: number; skipped: number }>({
    success: 0,
    skipped: 0,
  });

  const handleOpen = () => {
    setIsOpen(true);
    setStep("input");
    setStatusMessage("");
    setProgressPercent(0);
  };

  // Helper to determine if a product draft is 100% ready for approval
  const isDraftReady = (draft: InstagramProductDraft): boolean => {
    // 1. Must have valid non-empty price > 0
    if (typeof draft.price !== "number" || draft.price <= 0 || isNaN(draft.price)) {
      return false;
    }
    // 2. Must have at least one successfully uploaded R2 image
    if (
      draft.imageUploadStatus === "failed" ||
      !draft.images.some((img) => img.r2Url && img.status === "success")
    ) {
      return false;
    }
    // 3. Price confidence must be high (>= 0.8) or manually edited
    if (draft.fieldSources.price !== "manual" && draft.fieldConfidence.price < 0.7) {
      return false;
    }
    // 4. Title must be non-empty
    if (!draft.title.trim()) {
      return false;
    }
    return true;
  };

  // Computed counts
  const readyDrafts = React.useMemo(() => drafts.filter((d) => isDraftReady(d)), [drafts]);
  const imageFailedDrafts = React.useMemo(
    () => drafts.filter((d) => d.imageUploadStatus === "failed"),
    [drafts],
  );
  const needsReviewDrafts = React.useMemo(
    () => drafts.filter((d) => !isDraftReady(d) && d.imageUploadStatus !== "failed"),
    [drafts],
  );

  const filteredDrafts = React.useMemo(() => {
    switch (filterTab) {
      case "ready":
        return readyDrafts;
      case "image_failed":
        return imageFailedDrafts;
      case "needs_review":
        return needsReviewDrafts;
      case "all":
      default:
        return drafts;
    }
  }, [drafts, filterTab, readyDrafts, imageFailedDrafts, needsReviewDrafts]);

  // Step 1 -> Run Import Pipeline
  const handleStartImport = async () => {
    const rawUrls = urlsText
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    let cleanUsername = username.trim();
    if (cleanUsername.includes("instagram.com/")) {
      const match = cleanUsername.match(/instagram\.com\/([^/?#]+)/);
      if (match && match[1]) {
        cleanUsername = match[1];
      }
    }
    cleanUsername = cleanUsername.replace(/^@/, "").replace(/\/+$/, "").trim();

    if (!cleanUsername && rawUrls.length === 0) {
      toast.error(
        isAr
          ? "يرجى كتابة اسم حساب إنستغرام أو لصق روابط المنشورات"
          : "Please enter an Instagram username or paste post URLs",
      );
      return;
    }

    try {
      // 1. Apify Scraping Actor
      setStep("scraping");
      setStatusMessage(
        isAr
          ? `بدء سحب المنشورات عبر Apify (المطلوب: ${limit} منشور)...`
          : `Starting Apify scraping run (requesting ${limit} posts)...`,
      );
      setProgressPercent(15);

      const runInit = await fetchInstagramPosts({
        data: {
          username: cleanUsername || undefined,
          urls: rawUrls.length > 0 ? rawUrls : undefined,
          range: limit,
        },
      });

      setStatusMessage(isAr ? "جاري استخراج بيانات الحساب..." : "Crawling Instagram posts...");
      setProgressPercent(25);

      // Poll until finished (up to 3 minutes)
      let pollCount = 0;
      let datasetId = runInit.datasetId;
      let succeeded = false;
      const maxPolls = 60;
      while (pollCount < maxPolls) {
        await new Promise((r) => setTimeout(r, 3000));
        pollCount++;
        const check = await checkScraperStatus({ data: { runId: runInit.runId } });
        if (check.status === "SUCCEEDED") {
          succeeded = true;
          break;
        }
        if (check.status === "FAILED" || check.status === "ABORTED" || check.status === "TIMED-OUT") {
          throw new Error(
            isAr
              ? `فشلت عملية السحب بحالة (${check.status}). تأكد من أن الحساب عام (Public).`
              : `Scraping failed with status: ${check.status}. Make sure the account is public.`,
          );
        }
        setProgressPercent(Math.min(48, 25 + Math.floor(pollCount * 0.38)));
      }

      if (!succeeded) {
        throw new Error(
          isAr
            ? "استغرقت عملية سحب المنشورات وقتاً طويلاً. يرجى تجربة سحب 5 أو 10 منشورات أولاً أو التأكد من إتاحة الحساب."
            : "Scraping timed out. Please try with fewer posts or verify account accessibility.",
        );
      }

      setStatusMessage(isAr ? "قراءة الصور والمنشورات..." : "Loading post data...");
      setProgressPercent(50);
      const rawPosts = await fetchScraperDataset({ data: { datasetId } });

      if (rawPosts.length === 0) {
        throw new Error(
          isAr
            ? "لم يتم العثور على أي منشورات عامة في هذا الحساب."
            : "No public posts found for this account.",
        );
      }

      // 2. Cloudflare R2 Rehosting with Integrity Checks
      setStep("rehosting");
      setStatusMessage(
        isAr
          ? `رفع ${rawPosts.length} منشور وسائط إلى سحابة R2 مع فحص السلامة...`
          : `Rehosting media to R2 with integrity checks (${rawPosts.length} posts)...`,
      );
      setProgressPercent(65);

      const rehostRes = await batchRehostAllMedia({
        data: {
          brandId,
          posts: rawPosts,
        },
      });

      // 3. Gemini AI Analysis with Per-Field Confidence and Regex Reconciliation
      setStep("analyzing");
      setStatusMessage(
        isAr
          ? "تحليل الكابتشن والأسعار بدقة الذكاء الاصطناعي والتحقق المستقل..."
          : "Analyzing titles, prices, and sizes with confidence gate...",
      );
      setProgressPercent(85);

      const parseRes = await batchParseCaptionsWithAI({
        data: {
          posts: rehostRes.posts,
        },
      });

      setDrafts(parseRes.drafts);
      setProgressPercent(100);
      setStep("review");
      toast.success(
        isAr
          ? `تم تجهيز ${parseRes.drafts.length} مسودة للمراجعة البصرية.`
          : `Prepared ${parseRes.drafts.length} drafts for visual review.`,
      );
    } catch (err: any) {
      console.error("Instagram import pipeline error:", err);
      toast.error(err?.message || (isAr ? "فشل استيراد إنستغرام" : "Instagram import failed"));
      setStep("input");
    }
  };

  // Inline Draft Updating & Field Source Tracking
  const updateDraft = (id: string, patch: Partial<InstagramProductDraft>) => {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.id !== id) return draft;
        return {
          ...draft,
          ...patch,
        };
      }),
    );
  };

  const handleFieldEdit = (
    draftId: string,
    field: "title" | "price" | "category" | "sizes" | "description",
    value: any,
  ) => {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.id !== draftId) return draft;

        const updatedSources = {
          ...draft.fieldSources,
          [field]: "manual" as const,
        };

        const updatedConfidence = {
          ...draft.fieldConfidence,
          [field === "title" ? "name" : field]: 1.0, // Merchant manual review gives 100% confidence
        };

        const updatedIssues = draft.issues.filter((iss) => {
          if (field === "price" && (iss === "missing_price" || iss === "price_conflict")) {
            return false;
          }
          return true;
        });

        return {
          ...draft,
          [field]: value,
          fieldSources: updatedSources,
          fieldConfidence: updatedConfidence,
          priceConflict: field === "price" ? undefined : draft.priceConflict,
          issues: updatedIssues,
        };
      }),
    );
  };

  // Switch Active Cover Image in Carousel
  const handleSelectCover = (draftId: string, imageIndex: number) => {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.id !== draftId) return draft;
        const updatedImages = draft.images.map((img, idx) => ({
          ...img,
          isCover: idx === imageIndex,
        }));
        const cover = updatedImages[imageIndex];
        return {
          ...draft,
          images: updatedImages,
          coverImageUrl: cover?.r2Url || cover?.url || draft.coverImageUrl,
        };
      }),
    );
  };

  // Retry Failed Image Upload
  const handleRetryImage = async (draftId: string, imgUrl: string) => {
    setRetryingImageId(draftId);
    try {
      const res = await retryImageRehostFn({
        data: {
          brandId,
          imageUrl: imgUrl,
        },
      });

      if (res.r2Url) {
        setDrafts((prev) =>
          prev.map((draft) => {
            if (draft.id !== draftId) return draft;
            const updatedImages = draft.images.map((img) =>
              img.url === imgUrl
                ? { ...img, r2Url: res.r2Url, status: "success" as const, errorMessage: undefined }
                : img,
            );
            const allSuccess = updatedImages.every((i) => i.status === "success");
            const anySuccess = updatedImages.some((i) => i.status === "success");
            const imageUploadStatus = allSuccess
              ? "all_success"
              : anySuccess
                ? "partial_success"
                : ("failed" as const);

            return {
              ...draft,
              images: updatedImages,
              coverImageUrl: draft.coverImageUrl || res.r2Url || "",
              imageUploadStatus,
              issues: draft.issues.filter((i) => i !== "image_upload_failed"),
            };
          }),
        );
        toast.success(isAr ? "تم إعادة رفع الصورة بنجاح!" : "Image re-uploaded successfully!");
      } else {
        toast.error(res.error || (isAr ? "فشل إعادة رفع الصورة" : "Image retry failed"));
      }
    } catch (e: any) {
      toast.error(e?.message || (isAr ? "تعذر الاتصال بـ R2" : "R2 retry error"));
    } finally {
      setRetryingImageId(null);
    }
  };

  // Bulk Approve Ready Drafts
  const handleBulkApprove = async () => {
    if (readyDrafts.length === 0) {
      toast.error(
        isAr
          ? "لا توجد منتجات جاهزة للاعتماد حالياً. يرجى مراجعة الأسعار والحقول الناقصة."
          : "No drafts are fully ready for bulk approval.",
      );
      return;
    }

    try {
      setStep("saving");
      setStatusMessage(
        isAr
          ? `حفظ ${readyDrafts.length} مسودة في المتجر...`
          : `Saving ${readyDrafts.length} drafts to inventory...`,
      );

      const res = await bulkInsertProducts({
        data: {
          brandId,
          products: readyDrafts,
        },
      });

      setImportResult({ success: res.successCount, skipped: res.skippedCount });
      setStep("success");
      onComplete();
    } catch (err: any) {
      console.error("Bulk approve error:", err);
      toast.error(err?.message || (isAr ? "فشل حفظ المسودات" : "Failed to save drafts"));
      setStep("review");
    }
  };

  // Individual Product Save
  const handleSingleApprove = async (draft: InstagramProductDraft) => {
    if (!isDraftReady(draft)) {
      toast.error(
        isAr
          ? "يرجى تصحيح الحقول المميزة باللون الأحمر وإدخال السعر قبل الاعتماد."
          : "Please fix red fields and enter a price before approving.",
      );
      return;
    }

    try {
      const res = await bulkInsertProducts({
        data: {
          brandId,
          products: [draft],
        },
      });

      // Remove from active review list
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      toast.success(
        isAr
          ? `تم حفظ "${draft.title}" كمسودة بنجاح!`
          : `Draft "${draft.title}" saved successfully!`,
      );
      onComplete();
    } catch (err: any) {
      toast.error(err?.message || (isAr ? "فشل حفظ المنتج" : "Failed to save product"));
    }
  };

  return (
    <>
      {trigger ? (
        <div onClick={handleOpen}>{trigger}</div>
      ) : !isControlled ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpen}
          className="border-primary/30 text-primary hover:bg-primary/10 transition-all font-semibold gap-2"
        >
          <Instagram className="h-4 w-4 text-primary" />
          {isAr ? "استيراد كتالوج إنستغرام" : "Import from Instagram"}
        </Button>
      ) : null}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          onPointerDownOutside={(e) => {
            // Prevent accidental outside-click modal dismissal
            e.preventDefault();
          }}
          onInteractOutside={(e) => {
            e.preventDefault();
          }}
          className="max-w-5xl max-h-[92vh] flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl p-0"
        >
          {/* Header */}
          <DialogHeader className="border-b border-border p-4 sm:p-5 shrink-0 bg-muted/20">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
                  <Instagram className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold">
                    {isAr
                      ? "استيراد منتجات إنستغرام (Apify + Gemini)"
                      : "Instagram Product Importer"}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    {isAr
                      ? "سحب المنشورات، فحص سلامة الصور وتخزينها على R2، والتحقق المستقل من الأسعار كمسودات آمنة."
                      : "Extract posts, verify images onto R2, and reconcile prices into safe catalog drafts."}
                  </DialogDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {step === "review" && (
                  <Badge variant="outline" className="border-primary/30 text-primary font-bold">
                    {drafts.length} {isAr ? "منشور مستورد" : "Imported"}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-[300px]">
            {/* STEP 1: Input Form */}
            {step === "input" && (
              <div className="max-w-2xl mx-auto space-y-6 py-2">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground">
                      {isAr
                        ? "اسم حساب إنستغرام (مثال: pura.line)"
                        : "Instagram Username (e.g. pura.line)"}
                    </Label>
                    <div className="relative">
                      <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">
                        @
                      </span>
                      <Input
                        placeholder="pura.line"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="ps-8 rounded-xl font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground">
                      {isAr
                        ? "أو روابط منشورات محددة (رابط في كل سطر)"
                        : "Or Direct Public Post URLs (one per line)"}
                    </Label>
                    <Textarea
                      placeholder="https://www.instagram.com/p/DF..."
                      value={urlsText}
                      onChange={(e) => setUrlsText(e.target.value)}
                      rows={3}
                      className="rounded-xl font-mono text-xs"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
                    <Label className="text-xs font-bold text-foreground">
                      {isAr ? "عدد المنشورات المطلوبة:" : "Maximum posts to fetch:"}
                    </Label>
                    <div className="flex flex-wrap items-center gap-2">
                      {[5, 10, 20, 30, 50].map((num) => (
                        <Button
                          key={num}
                          type="button"
                          variant={limit === num ? "default" : "outline"}
                          size="sm"
                          onClick={() => setLimit(num)}
                          className="h-7 px-2.5 text-xs font-semibold rounded-lg"
                        >
                          {num}
                        </Button>
                      ))}
                      <div className="flex items-center gap-1.5 ms-1">
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={limit}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val >= 1 && val <= 100) {
                              setLimit(val);
                            }
                          }}
                          className="h-7 w-16 text-xs text-center font-bold font-mono rounded-lg"
                        />
                        <span className="text-[11px] text-muted-foreground">{isAr ? "منشور" : "posts"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rate Limits & Quality Gate Notice */}
                <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <Info className="h-4 w-4 text-primary shrink-0" />
                      <span>{isAr ? "ضمانات الأمان ودقة الأسعار" : "Safety & Accuracy Gate"}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowRateLimitDoc(!showRateLimitDoc)}
                      className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {showRateLimitDoc
                        ? isAr
                          ? "إخفاء التفاصيل"
                          : "Hide details"
                        : isAr
                          ? "حدود معدل الاستخدام"
                          : "Rate limits info"}
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {isAr
                      ? "• يتم رفع كافة الصور فوراً لـ R2 مع التحقق من سلامة الملفات.\n• فحص مستقل للسعر بـ Regex ومطابقته مع Gemini (أي تعارض أو سعر غير صريح يترك فارغاً للمراجعة).\n• تُحفظ جميع المنتجات كمسودات مغلقة حصراً."
                      : "• Images are immediately re-hosted to R2 with integrity verification.\n• Independent Regex price verification against Gemini.\n• All imported items are mandatorily saved as drafts."}
                  </p>

                  {showRateLimitDoc && (
                    <div className="pt-2 border-t border-border/60 text-xs space-y-1 text-muted-foreground">
                      <p>
                        <strong>Apify Scraper:</strong> {RATE_LIMIT_INFO.apify.freeTierDesc}
                      </p>
                      <p>
                        <strong>Google Gemini:</strong> حد أقصى {RATE_LIMIT_INFO.gemini.rpm}{" "}
                        طلب/دقيقة، و {RATE_LIMIT_INFO.gemini.rpd} طلب/يوم. (يتم التراجع التلقائي عند
                        الضغط دون فقد البيانات).
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleStartImport}
                    className="gap-2 px-6 font-bold shadow-md h-10 rounded-xl"
                  >
                    <Sparkles className="h-4 w-4" />
                    {isAr ? "بدء السحب والتحليل الذكي" : "Start Extraction Pipeline"}
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 2: Progress States */}
            {(step === "scraping" ||
              step === "rehosting" ||
              step === "analyzing" ||
              step === "saving") && (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                <div className="relative">
                  <div className="h-16 w-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Instagram className="h-6 w-6 text-primary animate-pulse" />
                  </div>
                </div>

                <div className="space-y-1.5 max-w-md">
                  <h3 className="text-base font-bold text-foreground">{statusMessage}</h3>
                  <div className="w-64 h-2 bg-muted rounded-full overflow-hidden mx-auto mt-2">
                    <div
                      className="h-full bg-primary transition-all duration-500 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    {isAr
                      ? "جاري المعالجة والتحقق لضمان أعلى دقة وسلامة..."
                      : "Processing media and validating fields..."}
                  </p>
                </div>
              </div>
            )}

            {/* STEP 3: Visual Review Screen (Cards Grid) */}
            {step === "review" && (
              <div className="space-y-4">
                {/* Top Summary Bar & Filter Tabs */}
                <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-md pb-3 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  {/* Counters Tabs */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      type="button"
                      variant={filterTab === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilterTab("all")}
                      className="h-8 text-xs font-bold rounded-lg"
                    >
                      {isAr ? "الكل" : "All"} ({drafts.length})
                    </Button>

                    <Button
                      type="button"
                      variant={filterTab === "ready" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilterTab("ready")}
                      className={cn(
                        "h-8 text-xs font-bold rounded-lg gap-1.5",
                        filterTab !== "ready" &&
                          "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10",
                      )}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {isAr ? "جاهز للاعتماد" : "Ready"} ({readyDrafts.length})
                    </Button>

                    <Button
                      type="button"
                      variant={filterTab === "needs_review" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilterTab("needs_review")}
                      className={cn(
                        "h-8 text-xs font-bold rounded-lg gap-1.5",
                        filterTab !== "needs_review" &&
                          "border-amber-500/30 text-amber-600 hover:bg-amber-500/10",
                      )}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {isAr ? "يحتاج مراجعة" : "Needs Review"} ({needsReviewDrafts.length})
                    </Button>

                    {imageFailedDrafts.length > 0 && (
                      <Button
                        type="button"
                        variant={filterTab === "image_failed" ? "destructive" : "outline"}
                        size="sm"
                        onClick={() => setFilterTab("image_failed")}
                        className="h-8 text-xs font-bold rounded-lg gap-1.5"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {isAr ? "فشل تحميل الصور" : "Image Failed"} ({imageFailedDrafts.length})
                      </Button>
                    )}
                  </div>

                  {/* Bulk Approve Action */}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleBulkApprove}
                      disabled={readyDrafts.length === 0}
                      className="h-8 px-4 text-xs font-bold rounded-lg gap-2 shadow-sm"
                      title={
                        readyDrafts.length === 0
                          ? isAr
                            ? "لا يمكن الاعتماد الجماعي قبل استكمال الحقول الإلزامية والأسعار"
                            : "Bulk approval requires all products to have valid prices and high confidence"
                          : undefined
                      }
                    >
                      <Check className="h-4 w-4" />
                      {isAr
                        ? `اعتماد المنتجات الجاهزة (${readyDrafts.length})`
                        : `Approve Ready (${readyDrafts.length})`}
                    </Button>
                  </div>
                </div>

                {/* Empty State */}
                {filteredDrafts.length === 0 && (
                  <div className="py-12 text-center text-muted-foreground text-xs">
                    {isAr ? "لا توجد عناصر مطابقة لهذا الفلتر." : "No items match this filter."}
                  </div>
                )}

                {/* Cards Visual Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredDrafts.map((draft) => {
                    const ready = isDraftReady(draft);
                    const priceConfidence = draft.fieldConfidence.price;
                    const isPriceLow =
                      draft.fieldSources.price !== "manual" &&
                      (priceConfidence < 0.6 || draft.price === null || draft.price <= 0);

                    return (
                      <div
                        key={draft.id}
                        className={cn(
                          "flex flex-col rounded-xl border bg-card overflow-hidden shadow-2xs transition-all",
                          ready ? "border-border/80" : "border-amber-500/40 bg-amber-500/[0.02]",
                          draft.imageUploadStatus === "failed" &&
                            "border-destructive/60 bg-destructive/[0.02]",
                        )}
                      >
                        {/* Media Section */}
                        <div className="relative aspect-square w-full bg-muted/40 overflow-hidden group">
                          {draft.coverImageUrl ? (
                            <img
                              src={draft.coverImageUrl}
                              alt={draft.title}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center">
                              <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
                              <span className="text-xs font-bold text-destructive">
                                {isAr ? "⚠️ فشل تحميل الصور" : "Image upload failed"}
                              </span>
                            </div>
                          )}

                          {/* Post Type Badges */}
                          <div className="absolute top-2 start-2 flex flex-col gap-1 z-10">
                            {draft.postType === "reel" && (
                              <Badge className="bg-zinc-900/80 text-white text-[10px] gap-1 backdrop-blur-xs font-semibold border-0">
                                <Video className="h-3 w-3" />
                                {isAr ? "مستخرجة من فيديو" : "Reel Cover"}
                              </Badge>
                            )}

                            {draft.postType === "carousel" && (
                              <Badge className="bg-zinc-900/80 text-white text-[10px] gap-1 backdrop-blur-xs font-semibold border-0">
                                <Layers className="h-3 w-3" />
                                {isAr
                                  ? `${draft.images.length} صور (معرض)`
                                  : `${draft.images.length} Images`}
                              </Badge>
                            )}
                          </div>

                          {/* External Link */}
                          <a
                            href={draft.url}
                            target="_blank"
                            rel="noreferrer"
                            className="absolute top-2 end-2 p-1.5 rounded-lg bg-zinc-900/60 hover:bg-zinc-900 text-white backdrop-blur-xs transition-colors"
                            title={isAr ? "عرض المنشور في إنستغرام" : "View on Instagram"}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>

                          {/* Image Failure Overlay */}
                          {draft.imageUploadStatus === "failed" && (
                            <div className="absolute inset-0 bg-background/80 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center gap-2">
                              <XCircle className="h-7 w-7 text-destructive" />
                              <p className="text-xs font-bold text-destructive">
                                {isAr ? "⚠️ فشل تحميل الصورة لـ R2" : "Image upload to R2 failed"}
                              </p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={retryingImageId === draft.id}
                                onClick={() =>
                                  handleRetryImage(draft.id, draft.images[0]?.url || "")
                                }
                                className="h-7 text-xs font-bold gap-1.5 border-destructive text-destructive hover:bg-destructive/10"
                              >
                                {retryingImageId === draft.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                {isAr ? "أعد المحاولة" : "Retry Upload"}
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Carousel Thumbnails Gallery (if multiple images) */}
                        {draft.images.length > 1 && (
                          <div className="flex items-center gap-1.5 p-2 bg-muted/20 border-b border-border overflow-x-auto">
                            {draft.images.map((img, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleSelectCover(draft.id, idx)}
                                className={cn(
                                  "relative h-10 w-10 shrink-0 rounded-md overflow-hidden border-2 transition-all",
                                  img.isCover
                                    ? "border-primary ring-1 ring-primary"
                                    : "border-border/60 opacity-60 hover:opacity-100",
                                )}
                                title={
                                  img.isCover
                                    ? isAr
                                      ? "الغلاف الرئيسي"
                                      : "Main Cover"
                                    : isAr
                                      ? "تعيين كغلاف رئيسي"
                                      : "Set as cover"
                                }
                              >
                                <img
                                  src={img.r2Url || img.url}
                                  alt={`thumb-${idx}`}
                                  className="h-full w-full object-cover"
                                />
                                {img.isCover && (
                                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                    <Check className="h-3 w-3 text-white drop-shadow-md" />
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Card Content & Inline Editable Fields */}
                        <div className="p-3.5 flex-1 flex flex-col gap-3">
                          {/* Title Field */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-muted-foreground">
                                {isAr ? "اسم المنتج" : "Title"}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] h-4 px-1 border-0",
                                  draft.fieldSources.name === "manual"
                                    ? "bg-primary/10 text-primary"
                                    : draft.fieldConfidence.name >= 0.8
                                      ? "bg-emerald-500/10 text-emerald-600"
                                      : "bg-amber-500/10 text-amber-600",
                                )}
                              >
                                {draft.fieldSources.name === "manual"
                                  ? isAr
                                    ? "تعديل يدوي"
                                    : "Edited"
                                  : isAr
                                    ? "استخراج ذكي"
                                    : "AI Extracted"}
                              </Badge>
                            </div>
                            <Input
                              value={draft.title}
                              onChange={(e) => handleFieldEdit(draft.id, "title", e.target.value)}
                              className="h-8 text-xs font-bold rounded-lg"
                            />
                          </div>

                          {/* Price Field - STRICT CONFIDENCE & ZERO DEFAULT RULE */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-foreground">
                                {isAr ? "السعر (د.ب)" : "Price (BHD)"}
                              </span>
                              {isPriceLow ? (
                                <span className="text-[10px] font-bold text-destructive">
                                  {isAr ? "⚠️ مطلوب التحقق" : "⚠️ Needs Input"}
                                </span>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] h-4 px-1 bg-emerald-500/10 text-emerald-600 border-0 font-bold"
                                >
                                  {draft.fieldSources.price === "manual"
                                    ? isAr
                                      ? "مؤكد يدوياً"
                                      : "Verified"
                                    : isAr
                                      ? "مطابق 100%"
                                      : "Matched"}
                                </Badge>
                              )}
                            </div>

                            <div className="relative">
                              <Input
                                type="number"
                                step="0.5"
                                min="0"
                                placeholder={isAr ? "أدخل السعر يدوياً" : "Enter price"}
                                value={draft.price === null ? "" : draft.price}
                                onChange={(e) => {
                                  const val =
                                    e.target.value === "" ? null : parseFloat(e.target.value);
                                  handleFieldEdit(draft.id, "price", val);
                                }}
                                className={cn(
                                  "h-8 text-xs font-bold rounded-lg font-mono",
                                  isPriceLow
                                    ? "border-destructive ring-1 ring-destructive bg-destructive/5 text-destructive placeholder:text-destructive/50"
                                    : "border-border",
                                )}
                              />
                            </div>

                            {/* Price Conflict or Missing Alert */}
                            {draft.priceConflict && (
                              <p className="text-[10px] text-destructive leading-tight">
                                {draft.priceConflict.reason}
                              </p>
                            )}
                          </div>

                          {/* Category and Sizes */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="space-y-1">
                              <span className="text-[11px] font-semibold text-muted-foreground">
                                {isAr ? "القسم" : "Category"}
                              </span>
                              <Input
                                value={draft.category ?? ""}
                                onChange={(e) =>
                                  handleFieldEdit(draft.id, "category", e.target.value)
                                }
                                placeholder={isAr ? "لم يُحدَّد" : "Not detected"}
                                className="h-7 text-xs rounded-lg"
                              />
                            </div>

                            <div className="space-y-1">
                              <span className="text-[11px] font-semibold text-muted-foreground">
                                {isAr ? "المقاسات" : "Sizes"}
                              </span>
                              <Input
                                value={draft.sizes.join(", ")}
                                onChange={(e) => {
                                  const parsedSizes = e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean);
                                  handleFieldEdit(draft.id, "sizes", parsedSizes);
                                }}
                                className="h-7 text-xs rounded-lg font-mono"
                              />
                            </div>
                          </div>

                          {/* Description */}
                          <div className="space-y-1">
                            <span className="text-[11px] font-semibold text-muted-foreground">
                              {isAr ? "الوصف" : "Description"}
                            </span>
                            <Textarea
                              rows={2}
                              value={draft.description}
                              onChange={(e) =>
                                handleFieldEdit(draft.id, "description", e.target.value)
                              }
                              className="text-xs rounded-lg resize-none"
                            />
                          </div>

                          {/* Individual Card Action */}
                          <div className="pt-2 mt-auto border-t border-border flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground font-semibold">
                              {ready
                                ? isAr
                                  ? "جاهز للاعتماد كمسودة"
                                  : "Ready to save"
                                : isAr
                                  ? "يتطلب إدخال السعر"
                                  : "Requires price"}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              disabled={!ready}
                              onClick={() => handleSingleApprove(draft)}
                              className="h-7 px-3 text-xs font-bold rounded-lg gap-1"
                            >
                              <Check className="h-3.5 w-3.5" />
                              {isAr ? "اعتماد" : "Approve"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 4: Success Result */}
            {step === "success" && (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                <div className="h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8" />
                </div>

                <div className="space-y-1 max-w-sm">
                  <h3 className="text-base font-bold text-foreground">
                    {isAr ? "اكتمل حفظ المسودات بنجاح!" : "Drafts Saved Successfully!"}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {isAr
                      ? `تم حفظ ${importResult.success} منتج كمسودات غير منشورة (Drafts). يمكنك مراجعتها ونشرها لاحقاً.`
                      : `Successfully saved ${importResult.success} unpublished drafts to your catalog.`}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    onClick={() => {
                      setIsOpen(false);
                      onComplete();
                    }}
                    className="font-bold rounded-xl"
                  >
                    {isAr ? "الذهاب إلى قائمة المنتجات" : "View Catalog"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
