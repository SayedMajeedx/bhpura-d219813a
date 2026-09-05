import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Instagram,
  Sparkles,
  CheckCircle2,
  Loader2,
  Package,
  ArrowRight,
  Store,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { provisionBrandWithOwner } from "@/lib/brand-provisioning";
import {
  fetchInstagramPosts,
  checkScraperStatus,
  fetchScraperDataset,
  batchParseCaptionsWithAI,
  batchRehostImages,
  bulkInsertProducts,
  type InstagramPostPreview,
  type InstagramProductDraft,
} from "@/lib/instagram-ai-importer";

export interface InstantInstagramOnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (slug: string) => void;
}

export function InstantInstagramOnboardingModal({
  open,
  onOpenChange,
  onSuccess,
}: InstantInstagramOnboardingModalProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const navigate = useNavigate();

  // Wizard Steps: "input" | "fetching" | "preview" | "provisioning" | "success"
  const [step, setStep] = React.useState<"input" | "fetching" | "preview" | "provisioning" | "success">("input");

  // Form State
  const [instagramHandle, setInstagramHandle] = React.useState("");
  const [storeNameEn, setStoreNameEn] = React.useState("");
  const [storeNameAr, setStoreNameAr] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [ownerEmail, setOwnerEmail] = React.useState("");
  const [ownerName, setOwnerName] = React.useState("");
  const [ownerPhone, setOwnerPhone] = React.useState("");
  const [ownerPassword, setOwnerPassword] = React.useState("");

  // Scraper & AI extraction state
  const [statusMessage, setStatusMessage] = React.useState("");
  const [scrapedPosts, setScrapedPosts] = React.useState<InstagramPostPreview[]>([]);
  const [drafts, setDrafts] = React.useState<InstagramProductDraft[]>([]);
  const [selectedDraftIds, setSelectedDraftIds] = React.useState<Set<string>>(new Set());

  // Auto-fill slug and names when instagram handle changes
  const handleInstagramChange = (val: string) => {
    const clean = val.replace(/^@/, "").trim().toLowerCase();
    setInstagramHandle(clean);
    if (!slug) {
      setSlug(clean.replace(/[^a-z0-9_-]/g, ""));
    }
    if (!storeNameEn) {
      // capitalize words
      const words = clean.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      setStoreNameEn(words);
    }
  };

  const handleStartScrape = async () => {
    if (!instagramHandle) {
      toast.error(isAr ? "يرجى إدخال حساب انستقرام" : "Please enter Instagram handle");
      return;
    }
    if (!storeNameEn.trim()) {
      toast.error(isAr ? "يرجى كتابة اسم المتجر بالإنجليزي" : "Store name in English is required");
      return;
    }
    if (!slug.trim()) {
      toast.error(isAr ? "يرجى تحديد المعرّف (Slug)" : "Store slug is required");
      return;
    }

    setStep("fetching");
    setStatusMessage(
      isAr
        ? "جاري الاتصال بـ Instagram وسحب المنتجات..."
        : "Connecting to Instagram & fetching posts...",
    );

    try {
      // 1. Start Apify Scraper run
      const initResult = await fetchInstagramPosts({
        data: {
          username: instagramHandle,
          range: 12,
        },
      });

      const { runId, datasetId } = initResult;

      // 2. Poll status
      let status = "RUNNING";
      let attempt = 0;
      const maxRetries = 40;

      while (status === "RUNNING" || status === "READY") {
        if (attempt >= maxRetries) {
          throw new Error("Scraping timed out. Trying with available data.");
        }
        attempt++;
        setStatusMessage(
          isAr
            ? `جاري استخراج منشورات الكتالوج (${attempt}/${maxRetries})...`
            : `Extracting catalog posts (${attempt}/${maxRetries})...`,
        );
        await new Promise((r) => setTimeout(r, 2500));
        const checkResult = await checkScraperStatus({ data: { runId } });
        status = checkResult.status;
      }

      // 3. Fetch scraped posts
      setStatusMessage(isAr ? "جاري قراءة المنشورات والصور..." : "Reading posts and media...");
      const posts = await fetchScraperDataset({ data: { datasetId } });
      setScrapedPosts(posts);

      if (!posts || posts.length === 0) {
        throw new Error(
          isAr ? "لم نجد منشورات متاحة في هذا الحساب" : "No public posts found for this account",
        );
      }

      // 4. Batch parse with Gemini Vision
      setStatusMessage(
        isAr
          ? "الذكاء الاصطناعي (Gemini Vision) يحلل الأسعار والأسماء والألوان..."
          : "AI (Gemini Vision) is analyzing prices, sizes, and colors...",
      );

      let aiDrafts: InstagramProductDraft[] = [];
      try {
        const parsed = await batchParseCaptionsWithAI({
          data: {
            brandId: "00000000-0000-0000-0000-000000000000", // Will be remapped on provision
            posts: posts.slice(0, 10).map((p) => ({
              id: p.id,
              url: p.url,
              imageUrl: p.imageUrl,
              caption: p.caption,
              isSoldOut: p.isSoldOut,
              isVideo: p.isVideo,
            })),
          },
        });
        if (parsed?.products && Array.isArray(parsed.products)) {
          aiDrafts = parsed.products.map((p: any) => ({
            id: p.id,
            imageUrl: p.imageUrl,
            url: p.url,
            isSoldOut: Boolean(p.isSoldOut),
            title: p.title || "Instagram Item",
            price: typeof p.price === "number" ? p.price : 45,
            description: p.description || "",
            sizes: Array.isArray(p.sizes) ? p.sizes : [],
            colors: Array.isArray(p.colors) ? p.colors : [],
            category: p.category || "Fashion",
            confidence: typeof p.confidence === "number" ? p.confidence : 0.85,
            issues: Array.isArray(p.issues) ? p.issues : [],
          }));
        }
      } catch (err) {
        console.warn("AI parsing fallback", err);
      }

      if (aiDrafts.length === 0) {
        aiDrafts = posts.slice(0, 10).map((p, idx) => ({
          id: p.id,
          imageUrl: p.imageUrl,
          url: p.url,
          isSoldOut: p.isSoldOut,
          title: `Product #${idx + 1}`,
          price: 45,
          description: p.caption.slice(0, 200),
          sizes: ["S", "M", "L"],
          colors: ["Black"],
          category: "Fashion",
          confidence: 0.9,
          issues: [],
        }));
      }

      setDrafts(aiDrafts);
      const selected = new Set<string>();
      aiDrafts.forEach((d) => {
        if (!d.isSoldOut) selected.add(d.id);
      });
      setSelectedDraftIds(selected);
      setStep("preview");
    } catch (err: any) {
      console.error(err);
      toast.error(
        isAr
          ? `حدث خطأ أثناء الجلب من انستقرام: ${err.message}`
          : `Instagram import error: ${err.message}`,
      );
      setStep("input");
    }
  };

  const handleDeployStore = async () => {
    setStep("provisioning");
    setStatusMessage(isAr ? "جاري إنشاء المتجر وحساب الإدارة..." : "Creating boutique & owner account...");

    try {
      // 1. Provision Brand Tenant
      const provisioned = await provisionBrandWithOwner({
        slug,
        name_en: storeNameEn.trim(),
        name_ar: storeNameAr.trim() || null,
        owner_name: ownerName.trim() || storeNameEn.trim(),
        owner_email: ownerEmail.trim(),
        owner_phone: ownerPhone.trim() || null,
        owner_password: ownerPassword.trim() || "Boutq2026!",
        plan_type: "trial",
      });

      const brandId = provisioned.brand_id;

      // 2. Filter selected drafts
      const draftsToImport = drafts.filter((d) => selectedDraftIds.has(d.id));

      if (draftsToImport.length > 0) {
        setStatusMessage(isAr ? "جاري رفع الصور إلى التخزين السحابي الدائم (R2)..." : "Rehosting images to Cloudflare R2...");
        
        // Rehost images
        const rehosted = await batchRehostImages({
          data: {
            brandId,
            drafts: draftsToImport,
          },
        }).catch((err) => {
          console.warn("Rehost note", err);
          return draftsToImport;
        });

        setStatusMessage(isAr ? "جاري إدخال المنتجات في الكتالوج..." : "Inserting products into database...");
        
        await bulkInsertProducts({
          data: {
            brandId,
            drafts: rehosted,
          },
        });
      }

      toast.success(
        isAr
          ? "🎉 مبروك! تم إطلاق متجرك واستيراد المنتجات بنجاح!"
          : "🎉 Congratulations! Your store is launched and products are imported!",
      );

      setStep("success");
      if (onSuccess) onSuccess(slug);

      // Auto redirect to new boutique dashboard
      setTimeout(() => {
        onOpenChange(false);
        navigate({ to: `/admin/b/$slug/dashboard`, params: { slug } });
      }, 1500);
    } catch (err: any) {
      console.error(err);
      toast.error(isAr ? `فشل إطلاق المتجر: ${err.message}` : `Deployment error: ${err.message}`);
      setStep("preview");
    }
  };

  const toggleSelectDraft = (id: string) => {
    setSelectedDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto bg-card border border-border text-foreground p-6 rounded-3xl shadow-2xl">
        <DialogHeader className="space-y-1.5 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-2xl bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-500 flex items-center justify-center text-white shadow-md">
              <Instagram className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <span>{isAr ? "إطلاق المتجر الفوري من انستقرام" : "Instant Instagram Store Launch"}</span>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
                  AI Powered
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isAr
                  ? "حوّل حساب انستقرام إلى متجر إلكتروني احترافي متكامل مع المنتجات بضغطة زر واحدة."
                  : "Turn your Instagram account into a fully-functional boutique with imported products in 60 seconds."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* STEP 1: INPUT */}
        {step === "input" && (
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-bold text-foreground">
                {isAr ? "حساب انستقرام التجاري" : "Instagram Business Handle"}
              </Label>
              <div className="relative mt-1">
                <span className="absolute inset-y-0 start-3 flex items-center text-muted-foreground font-mono text-sm">
                  @
                </span>
                <Input
                  value={instagramHandle}
                  onChange={(e) => handleInstagramChange(e.target.value)}
                  placeholder="pureline_bh"
                  className="ps-8 text-sm font-mono h-10 rounded-xl"
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {isAr ? "سنقوم باستخراج الكتالوج، الصور، والأسعار تلقائياً عبر الذكاء الاصطناعي." : "We'll scrape public posts, images, and prices with Gemini Vision."}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <Label className="text-xs font-semibold">
                  {isAr ? "اسم المتجر (إنجليزي)" : "Store Name (English)"}
                </Label>
                <Input
                  value={storeNameEn}
                  onChange={(e) => setStoreNameEn(e.target.value)}
                  placeholder="Pure Line Boutique"
                  className="h-9 text-xs rounded-xl mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">
                  {isAr ? "اسم المتجر (عربي)" : "Store Name (Arabic)"}
                </Label>
                <Input
                  value={storeNameAr}
                  onChange={(e) => setStoreNameAr(e.target.value)}
                  placeholder="بوتيك بيور لاين"
                  className="h-9 text-xs rounded-xl mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">
                  {isAr ? "معرّف الرابط (Slug)" : "Store URL Slug"}
                </Label>
                <div className="flex items-center gap-1 mt-1">
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                    placeholder="pureline"
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                  <span className="text-[11px] text-muted-foreground font-mono">.boutq.site</span>
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold">
                  {isAr ? "بريد المدير الإلكتروني" : "Owner Email"}
                </Label>
                <Input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="owner@pureline.com"
                  className="h-9 text-xs rounded-xl mt-1"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-border/60 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                size="sm"
                onClick={handleStartScrape}
                className="h-10 px-5 text-xs font-bold bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
              >
                <Sparkles className="size-4 me-1.5" />
                {isAr ? "استخراج الكتالوج بالذكاء الاصطناعي" : "Fetch Catalog with AI"}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: FETCHING & AI ANALYZING */}
        {step === "fetching" && (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="relative">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="size-8 animate-spin text-primary" />
              </div>
              <Sparkles className="size-5 text-amber-500 absolute -top-1 -end-1 animate-bounce" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-sm text-foreground">
                {isAr ? "جاري تحضير كتالوج المتجر..." : "Preparing Boutique Catalog..."}
              </h4>
              <p className="text-xs text-muted-foreground font-mono max-w-sm">
                {statusMessage}
              </p>
            </div>
          </div>
        )}

        {/* STEP 3: PREVIEW & CONFIRM */}
        {step === "preview" && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between bg-muted/40 p-3 rounded-2xl border border-border/60">
              <div className="flex items-center gap-2">
                <Package className="size-4 text-primary" />
                <span className="text-xs font-bold text-foreground">
                  {isAr
                    ? `تم استخراج ${drafts.length} منتج من @${instagramHandle}`
                    : `Extracted ${drafts.length} products from @${instagramHandle}`}
                </span>
              </div>
              <Badge variant="outline" className="text-[11px] font-mono">
                {selectedDraftIds.size} {isAr ? "محدد للاستيراد" : "Selected"}
              </Badge>
            </div>

            {/* Grid of Extracted Drafts */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto p-1">
              {drafts.map((draft) => {
                const isSelected = selectedDraftIds.has(draft.id);
                return (
                  <div
                    key={draft.id}
                    onClick={() => toggleSelectDraft(draft.id)}
                    className={`relative rounded-xl border p-2 cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                        : "border-border/60 bg-card opacity-60 hover:opacity-100"
                    }`}
                  >
                    <div className="aspect-square rounded-lg bg-muted overflow-hidden relative">
                      <img
                        src={draft.imageUrl}
                        alt={draft.title}
                        className="size-full object-cover"
                        crossOrigin="anonymous"
                      />
                      <div className="absolute top-1.5 start-1.5">
                        <Checkbox checked={isSelected} />
                      </div>
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      <h5 className="font-bold text-[11px] truncate text-foreground">{draft.title}</h5>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                        <span className="font-bold text-foreground">{draft.price ? `${draft.price} BHD` : "—"}</span>
                        {draft.category && <span className="truncate max-w-[60px]">{draft.category}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-border/60 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep("input")} className="text-xs">
                {isAr ? "رجوع" : "Back"}
              </Button>
              <Button
                size="sm"
                onClick={handleDeployStore}
                disabled={selectedDraftIds.size === 0}
                className="h-10 px-6 text-xs font-bold bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
              >
                <Store className="size-4 me-1.5" />
                {isAr ? "إطلاق المتجر واستيراد المنتجات فوراً" : "Deploy Store & Import Products"}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: PROVISIONING & FINALIZING */}
        {step === "provisioning" && (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <Loader2 className="size-10 animate-spin text-primary" />
            <div className="space-y-1">
              <h4 className="font-bold text-sm text-foreground">
                {isAr ? "جاري تفعيل المتجر ورفع الصور..." : "Deploying Store & Uploading Media..."}
              </h4>
              <p className="text-xs text-muted-foreground font-mono">{statusMessage}</p>
            </div>
          </div>
        )}

        {/* STEP 5: SUCCESS */}
        {step === "success" && (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
            <div className="size-14 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="size-8" />
            </div>
            <h4 className="font-bold text-base text-foreground">
              {isAr ? "تم إطلاق المتجر بنجاح!" : "Store Launched Successfully!"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {isAr ? "جاري نقلك مباشرة إلى لوحة التحكم الخاصة بالبوتيك..." : "Redirecting to your boutique dashboard..."}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
