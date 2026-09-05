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
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { registerInstantTrial } from "@/lib/onboarding.functions";
import { provisionBrandWithOwner } from "@/lib/brand-provisioning";
import {
  fetchInstagramPosts,
  checkScraperStatus,
  fetchScraperDataset,
  fetchInstagramGraphPosts,
  getInstagramAuthorizeUrlFn,
  batchParseCaptionsWithAI,
  batchRehostImages,
  bulkInsertProducts,
  extractBoutiqueMetadataFromCaption,
  type InstagramPostPreview,
  type InstagramProductDraft,
} from "@/lib/instagram-ai-importer";

export interface InstantInstagramOnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (slug: string) => void;
  isAdminModal?: boolean;
}

export function InstantInstagramOnboardingModal({
  open,
  onOpenChange,
  onSuccess,
  isAdminModal = false,
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
  const [showPassword, setShowPassword] = React.useState(false);

  // Clear any residual impersonation cookies when modal opens
  React.useEffect(() => {
    if (open && typeof document !== "undefined") {
      document.cookie = "boutq_impersonation_token=; path=/; max-age=0; samesite=lax";
    }
  }, [open]);

  // Tracking manual edits so auto-fill from handle is smooth and non-destructive
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = React.useState(false);
  const [isNameEnManuallyEdited, setIsNameEnManuallyEdited] = React.useState(false);

  // Official Instagram OAuth & Provisioned Brand State
  const [provisionedBrandId, setProvisionedBrandId] = React.useState<string | null>(null);
  const [isConnectingOAuth, setIsConnectingOAuth] = React.useState(false);

  // Scraper & AI extraction state
  const [statusMessage, setStatusMessage] = React.useState("");
  const [scrapedPosts, setScrapedPosts] = React.useState<InstagramPostPreview[]>([]);
  const [drafts, setDrafts] = React.useState<InstagramProductDraft[]>([]);
  const [selectedDraftIds, setSelectedDraftIds] = React.useState<Set<string>>(new Set());

  // Auto-fill slug and names when instagram handle changes
  const handleInstagramChange = (val: string) => {
    const clean = val.replace(/^@/, "").trim().toLowerCase();
    setInstagramHandle(clean);
    if (!isSlugManuallyEdited) {
      setSlug(clean.replace(/[^a-z0-9_-]/g, ""));
    }
    if (!isNameEnManuallyEdited) {
      const words = clean.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      setStoreNameEn(words);
    }
  };

  // Requirement 4: Ensure an active brand and authenticated session exists BEFORE starting any import
  const ensureAuthenticatedBrandSession = async (): Promise<string> => {
    if (provisionedBrandId) {
      return provisionedBrandId;
    }

    if (isAdminModal) {
      if (!storeNameEn.trim()) {
        throw new Error(isAr ? "يرجى كتابة اسم المتجر بالإنجليزي" : "Store name in English is required");
      }
      if (!slug.trim()) {
        throw new Error(isAr ? "يرجى تحديد المعرّف (Slug)" : "Store slug is required");
      }
      if (!ownerEmail.trim() || !ownerEmail.includes("@")) {
        throw new Error(isAr ? "يرجى إدخال بريد إلكتروني صحيح" : "Valid owner email is required");
      }
      if (!ownerPassword.trim() || ownerPassword.trim().length < 6) {
        throw new Error(
          isAr
            ? "يرجى تعيين كلمة مرور مكونة من 6 خانات على الأقل"
            : "Password must be at least 6 characters",
        );
      }

      const cleanPhone = ownerPhone.trim()
        ? ownerPhone.trim().startsWith("+")
          ? ownerPhone.trim()
          : `+973${ownerPhone.trim().replace(/^0+/, "")}`
        : "+97300000000";

      const provisioned = await provisionBrandWithOwner({
        slug: slug.trim().toLowerCase(),
        name_en: storeNameEn.trim(),
        name_ar: storeNameAr.trim() || null,
        owner_name: ownerName.trim() || storeNameEn.trim(),
        owner_email: ownerEmail.trim().toLowerCase(),
        owner_phone: cleanPhone,
        owner_password: ownerPassword.trim(),
        plan_type: "trial",
      });
      setProvisionedBrandId(provisioned.brand_id);
      return provisioned.brand_id;
    }

    // Check if user already has an active Supabase session
    const { data: sessionData } = await supabase.auth.getSession();
    const currentSession = sessionData?.session;

    if (currentSession?.user) {
      const { data: brands } = await supabase
        .from("brands")
        .select("id")
        .eq("created_by", currentSession.user.id)
        .limit(1);
      if (brands && brands.length > 0) {
        setProvisionedBrandId(brands[0].id);
        return brands[0].id;
      }
    }

    // Unregistered visitor: validate fields first and create trial account
    if (!storeNameEn.trim()) {
      throw new Error(isAr ? "يرجى كتابة اسم المتجر بالإنجليزي أولاً" : "Store name in English is required");
    }
    if (!slug.trim()) {
      throw new Error(isAr ? "يرجى تحديد المعرّف (Slug) أولاً" : "Store slug is required");
    }
    if (!ownerEmail.trim() || !ownerEmail.includes("@")) {
      throw new Error(isAr ? "يرجى إدخال بريد إلكتروني صحيح لإنشاء الحساب أولاً" : "Valid owner email is required");
    }
    if (!ownerPassword.trim() || ownerPassword.trim().length < 6) {
      throw new Error(
        isAr
          ? "يرجى تعيين كلمة مرور مكونة من 6 خانات على الأقل لإنشاء الحساب أولاً"
          : "Password of at least 6 characters is required",
      );
    }

    const cleanPhone = ownerPhone.trim()
      ? ownerPhone.trim().startsWith("+")
      ? ownerPhone.trim()
      : `+973${ownerPhone.trim().replace(/^0+/, "")}`
      : "+97300000000";

    const cleanPassword = ownerPassword.trim();
    const cleanEmail = ownerEmail.trim().toLowerCase();

    const res = await registerInstantTrial({
      data: {
        brandName: storeNameAr.trim() || storeNameEn.trim(),
        nameEn: storeNameEn.trim(),
        nameAr: storeNameAr.trim() || undefined,
        slug: slug.trim().toLowerCase(),
        ownerName: ownerName.trim() || storeNameEn.trim(),
        contactNumber: cleanPhone,
        email: cleanEmail,
        password: cleanPassword,
        businessType: "Boutique & Fashion",
      },
    });

    if (res.alreadyRegistered) {
      throw new Error(res.message);
    }

    const brandId = res.brandId;
    setProvisionedBrandId(brandId);

    // Auto sign-in to guarantee session is active
    await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    });

    return brandId;
  };

  // Shared: Batch parse posts with Gemini AI and open preview step
  const parsePostsAndOpenPreview = async (posts: InstagramPostPreview[], currentBrandId: string) => {
    setScrapedPosts(posts);

    if (!posts || posts.length === 0) {
      throw new Error(
        isAr ? "لم نجد منشورات متاحة في هذا الحساب" : "No posts found for this account",
      );
    }

    setStatusMessage(
      isAr
        ? "الذكاء الاصطناعي يحلل الصور والأوصاف لاستخراج الأسعار والمقاسات والألوان... ✨"
        : "Gemini AI is analyzing photos and captions for prices, sizes, and colors... ✨",
    );

    let aiDrafts: InstagramProductDraft[] = [];
    try {
      const parsed = await batchParseCaptionsWithAI({
        data: {
          brandId: currentBrandId,
          posts: posts.slice(0, 12).map((p) => ({
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
          title: p.title || (isAr ? "منتج راقي" : "Luxury Product"),
          price: typeof p.price === "number" ? p.price : 35,
          description: p.description || "",
          sizes: Array.isArray(p.sizes) ? p.sizes : [],
          colors: Array.isArray(p.colors) ? p.colors : [],
          category: p.category || (isAr ? "أزياء" : "Fashion"),
          confidence: typeof p.confidence === "number" ? p.confidence : 0.85,
          issues: Array.isArray(p.issues) ? p.issues : [],
        }));
      }
    } catch (err) {
      console.warn("AI parsing fallback", err);
    }

    // Heuristic boutique fallback
    if (aiDrafts.length === 0) {
      aiDrafts = posts.slice(0, 10).map((p) => {
        const meta = extractBoutiqueMetadataFromCaption(p.caption, instagramHandle);
        return {
          id: p.id,
          imageUrl: p.imageUrl,
          url: p.url,
          isSoldOut: p.isSoldOut,
          title: meta.title,
          price: meta.price || 35,
          description: meta.description,
          sizes: [],
          colors: [],
          category: meta.category,
          confidence: meta.price ? 0.8 : 0.5,
          issues: [],
        };
      });
    }

    setDrafts(aiDrafts);
    const selected = new Set<string>();
    aiDrafts.forEach((d) => {
      if (!d.isSoldOut) selected.add(d.id);
    });
    setSelectedDraftIds(selected.size > 0 ? selected : new Set(aiDrafts.map((d) => d.id)));
    setStep("preview");
  };

  // Official Instagram Graph API Fetch
  const fetchPostsFromGraph = async (brandId: string, handle?: string) => {
    setStep("fetching");
    setStatusMessage(
      isAr
        ? "تم ربط حساب إنستغرام بنجاح! جاري جلب أحدث منشوراتك الرسمية... 📸"
        : "Connected to Instagram! Fetching your official posts... 📸",
    );

    try {
      const res = await fetchInstagramGraphPosts({
        data: {
          brandId,
          limit: 50,
        },
      });

      if (res.username && !instagramHandle) {
        setInstagramHandle(res.username);
      }

      await parsePostsAndOpenPreview(res.posts || [], brandId);
    } catch (err: any) {
      console.error("Failed to load Instagram Graph posts:", err);
      toast.error(
        isAr
          ? `تعذر استيراد المنشورات الرسمية: ${err.message}`
          : `Failed to fetch official posts: ${err.message}`,
      );
      setStep("input");
    }
  };

  // Listen for OAuth callback return from Meta
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const isConnected = params.get("instagram_connected") === "true";
    const brandId = params.get("brandId") || sessionStorage.getItem("boutq_pending_brand_id");
    const handle = params.get("instagram_handle");
    const igError = params.get("instagram_error");

    if (igError) {
      toast.error(
        isAr
          ? `تعذر إتمام ربط إنستغرام: ${igError}`
          : `Instagram connection error: ${igError}`,
      );
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (isConnected && brandId) {
      onOpenChange(true);
      setProvisionedBrandId(brandId);
      if (handle) setInstagramHandle(handle);

      const savedSlug = sessionStorage.getItem("boutq_pending_slug");
      if (savedSlug && !slug) setSlug(savedSlug);

      window.history.replaceState({}, document.title, window.location.pathname);
      fetchPostsFromGraph(brandId, handle || "");
    }
  }, []);

  // Action 1: Connect Official Instagram (Recommended)
  const handleConnectOfficialInstagram = async () => {
    try {
      setIsConnectingOAuth(true);
      toast.loading(
        isAr ? "جاري التحقق وإنشاء الحساب لبدء الربط الرسمي..." : "Creating account & initiating Meta connection...",
        { id: "ig-oauth" },
      );

      const brandId = await ensureAuthenticatedBrandSession();

      if (typeof window !== "undefined") {
        sessionStorage.setItem("boutq_pending_brand_id", brandId);
        sessionStorage.setItem("boutq_pending_slug", slug.trim().toLowerCase());
        sessionStorage.setItem("boutq_pending_email", ownerEmail.trim().toLowerCase());
      }

      const { url } = await getInstagramAuthorizeUrlFn({
        data: {
          brandId,
          returnTo: window.location.pathname,
        },
      });

      toast.success(
        isAr ? "تحويلك إلى صفحة تفويض إنستغرام الرسمية..." : "Redirecting to official Instagram authorization...",
        { id: "ig-oauth" },
      );

      window.location.href = url;
    } catch (err: any) {
      setIsConnectingOAuth(false);
      console.error("OAuth init failed:", err);
      toast.error(err.message || (isAr ? "فشل بدء الربط الرسمي" : "Failed to initiate official connection"), {
        id: "ig-oauth",
      });
    }
  };

  // Action 2: Fallback Scrape via Apify (Username only)
  const handleStartScrape = async () => {
    if (!instagramHandle) {
      toast.error(isAr ? "يرجى كتابة اسم حساب إنستغرام أولاً" : "Please enter Instagram username first");
      return;
    }

    try {
      // Requirement 4: Ensure authenticated session before scraping
      const brandId = await ensureAuthenticatedBrandSession();

      setStep("fetching");
      setStatusMessage(
        isAr
          ? "جاري الاتصال بخدمة الاستيراد وتصفح المنشورات العامة... 📸"
          : "Connecting to scraper and scanning public Instagram feed... 📸",
      );

      const initResult = await fetchInstagramPosts({
        data: {
          username: instagramHandle,
          range: 10,
        },
      });

      const { runId, datasetId } = initResult;

      // Poll status with eager dataset consumption
      let status = "RUNNING";
      let attempt = 0;
      const maxRetries = 25;
      let earlyPosts: InstagramPostPreview[] = [];

      while (status === "RUNNING" || status === "READY") {
        if (attempt >= maxRetries) {
          break;
        }
        attempt++;

        if (attempt <= 2) {
          setStatusMessage(
            isAr
              ? "جاري تصفح حساب انستقرام واستخراج المنشورات... 📸"
              : "Scanning your Instagram feed for your best posts... 📸",
          );
        } else if (attempt <= 5) {
          setStatusMessage(
            isAr
              ? "جاري استخراج بيانات المنتجات، الأسعار، والأوصاف... ✨"
              : "Extracting product codes, prices, and descriptions... ✨",
          );
        } else {
          setStatusMessage(
            isAr
              ? "جاري تجهيز صور المنتجات والكتالوج... ✨"
              : "Getting the photos and catalog ready... ✨",
          );
        }

        await new Promise((r) => setTimeout(r, 1200));

        if (attempt >= 3 && datasetId) {
          try {
            const partialRes = await fetchScraperDataset({ data: { datasetId } });
            if (Array.isArray(partialRes) && partialRes.length >= 6) {
              earlyPosts = partialRes;
              break;
            }
          } catch {
            // continue polling
          }
        }

        const checkResult = await checkScraperStatus({ data: { runId } });
        status = checkResult.status;
      }

      let posts = earlyPosts;
      if (posts.length === 0) {
        posts = (await fetchScraperDataset({ data: { datasetId } })) || [];
      }

      await parsePostsAndOpenPreview(posts, brandId);
    } catch (err: any) {
      console.error(err);
      toast.error(
        isAr
          ? `حدث خطأ أثناء الاستيراد: ${err.message}`
          : `Instagram import error: ${err.message}`,
      );
      setStep("input");
    }
  };

  const handleDeployStore = async () => {
    setStep("provisioning");
    setStatusMessage(
      isAr
        ? "جاري تجهيز متجرك الأنيق وحساب الإدارة... 🚀"
        : "Setting up your custom boutique storefront... 🚀",
    );

    // Clear any residual impersonation cookies before deploying
    if (typeof document !== "undefined") {
      document.cookie = "boutq_impersonation_token=; path=/; max-age=0; samesite=lax";
    }

    try {
      const brandId = provisionedBrandId || (await ensureAuthenticatedBrandSession());

      // Filter selected drafts
      const draftsToImport = drafts.filter((d) => selectedDraftIds.has(d.id));

      if (draftsToImport.length > 0) {
        setStatusMessage(
          isAr
            ? "نرفع الصور ونثبت لك المنتجات في متجرك... ☁️"
            : "Uploading photos and securing your products... ☁️",
        );

        // Rehost images to permanent storage
        const rehostResult = await batchRehostImages({
          data: {
            brandId,
            products: draftsToImport,
          },
        }).catch((err) => {
          console.warn("Rehost note", err);
          return { products: draftsToImport };
        });

        const finalProducts = (rehostResult as any)?.products || draftsToImport;

        setStatusMessage(
          isAr
            ? "خلاص قربنا! نحط اللمسات الأخيرة لمتجرك الجديد 🎉"
            : "Polishing the details and preparing your store... 🎉",
        );

        await bulkInsertProducts({
          data: {
            brandId,
            products: finalProducts,
          },
        });
      }

      toast.success(
        isAr
          ? "🎉 مبروك! تم إطلاق متجرك واستيراد المنتجات بنجاح!"
          : "🎉 Congratulations! Your store is launched and products are imported!",
      );

      setStep("success");

      // Auto-redirect to brand admin after 3 seconds
      setTimeout(() => {
        const cleanSlug = slug.trim().toLowerCase();
        window.location.href = `/admin/b/${cleanSlug}/dashboard`;
      }, 3000);
    } catch (err: any) {
      console.error(err);
      toast.error(
        isAr
          ? `تعذر إطلاق المتجر: ${err.message}`
          : `Failed to deploy store: ${err.message}`,
      );
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
            {/* Store Branding Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">
                  {isAr ? "اسم المتجر (إنجليزي)" : "Store Name (English)"} *
                </Label>
                <Input
                  value={storeNameEn}
                  onChange={(e) => {
                    setIsNameEnManuallyEdited(true);
                    setStoreNameEn(e.target.value);
                  }}
                  placeholder="Your Brand Name"
                  className="h-9 text-xs rounded-xl mt-1 placeholder:text-muted-foreground/35 placeholder:font-normal"
                  required
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">
                  {isAr ? "اسم المتجر (عربي)" : "Store Name (Arabic)"}
                </Label>
                <Input
                  value={storeNameAr}
                  onChange={(e) => setStoreNameAr(e.target.value)}
                  placeholder="اسم علامتك التجارية"
                  className="h-9 text-xs rounded-xl mt-1 placeholder:text-muted-foreground/35 placeholder:font-normal"
                />
              </div>
            </div>

            {/* Store URL Slug */}
            <div>
              <Label className="text-xs font-semibold">
                {isAr ? "معرّف الرابط (Slug)" : "Store URL Slug"} *
              </Label>
              <div
                dir="ltr"
                className="flex items-center rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 overflow-hidden h-9 mt-1 transition-colors"
              >
                <input
                  value={slug}
                  onChange={(e) => {
                    setIsSlugManuallyEdited(true);
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""));
                  }}
                  placeholder="yourbrand"
                  className="flex-1 min-w-0 bg-transparent px-3 text-xs text-foreground font-mono placeholder:text-muted-foreground/35 placeholder:font-normal focus:outline-none"
                  autoComplete="off"
                  required
                />
                <span
                  dir="ltr"
                  className="px-2.5 py-1.5 text-xs text-muted-foreground font-mono bg-muted/40 border-s border-border select-none shrink-0"
                >
                  .boutq.store
                </span>
              </div>
            </div>

            {/* Account & Login Credentials */}
            <div className="pt-2 border-t border-border/50 space-y-2.5">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                {isAr ? "بيانات حساب المالك وتأكيد الدخول" : "Owner Account & Login Credentials"}
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">
                    {isAr ? "الاسم الكامل" : "Full Name"} *
                  </Label>
                  <Input
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder={isAr ? "اسم مالك المتجر" : "Your full name"}
                    className="h-9 text-xs rounded-xl mt-1 placeholder:text-muted-foreground/35 placeholder:font-normal"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">
                    {isAr ? "البريد الإلكتروني" : "Owner Email"} *
                  </Label>
                  <Input
                    type="email"
                    dir="ltr"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="h-9 text-xs rounded-xl mt-1 placeholder:text-muted-foreground/40 placeholder:font-normal text-left font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">
                    {isAr ? "رقم الواتساب" : "WhatsApp Number"}
                  </Label>
                  <div
                    dir="ltr"
                    className="flex items-center rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 overflow-hidden h-9 mt-1 transition-colors"
                  >
                    <span
                      dir="ltr"
                      className="px-2.5 py-1.5 text-xs text-muted-foreground font-mono bg-muted/40 border-e border-border select-none shrink-0"
                    >
                      +973
                    </span>
                    <input
                      type="tel"
                      dir="ltr"
                      value={ownerPhone}
                      onChange={(e) => setOwnerPhone(e.target.value)}
                      placeholder="39955508"
                      className="flex-1 min-w-0 bg-transparent px-3 text-xs text-foreground font-mono placeholder:text-muted-foreground/35 placeholder:font-normal focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold">
                    {isAr ? "كلمة المرور (لتسجيل الدخول لاحقاً)" : "Password (to sign in later)"} *
                  </Label>
                  <div className="relative mt-1" dir={isAr ? "rtl" : "ltr"}>
                    <Input
                      type={showPassword ? "text" : "password"}
                      dir={isAr ? "rtl" : "ltr"}
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={6}
                      className={cn(
                        "h-9 text-xs rounded-xl pe-10 placeholder:text-muted-foreground/35 placeholder:font-normal font-mono",
                        isAr ? "text-right" : "text-left",
                      )}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 z-10 transition-colors"
                      tabIndex={-1}
                      aria-label={
                        showPassword
                          ? isAr
                            ? "إخفاء كلمة المرور"
                            : "Hide password"
                          : isAr
                            ? "إظهار كلمة المرور"
                            : "Show password"
                      }
                    >
                      {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* DUAL IMPORT METHODS CONTAINER */}
            <div className="pt-3 border-t border-border/60 space-y-3">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                {isAr ? "طرق استيراد المنتجات من إنستغرام" : "Instagram Catalog Import Methods"}
              </span>

              {/* OPTION 1: OFFICIAL INSTAGRAM (RECOMMENDED) */}
              <div className="p-4 rounded-2xl border-2 border-primary/40 bg-primary/5 hover:border-primary transition-all relative overflow-hidden group space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                        <Instagram className="size-4 text-primary" />
                        {isAr ? "ربط حساب إنستغرام (رسمي)" : "Connect Official Instagram (Meta)"}
                      </span>
                      <Badge className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5">
                        {isAr ? "موصى به • رسمي وموثق" : "Recommended • Official"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {isAr
                        ? "ربط مباشر ومعتمد من Meta يضمن أعلى دقة للصور والتفاصيل، واستيراد فوري بدون انتظار أو حظر."
                        : "Direct official Meta integration with full resolution photos, exact details, and high-speed sync."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isConnectingOAuth}
                    onClick={handleConnectOfficialInstagram}
                    className="h-11 px-5 text-xs font-bold bg-primary text-primary-foreground shadow-md hover:bg-primary/90 shrink-0 min-h-[44px]"
                  >
                    {isConnectingOAuth ? (
                      <Loader2 className="size-4 animate-spin me-2" />
                    ) : (
                      <ShieldCheck className="size-4 me-2" />
                    )}
                    {isAr ? "ربط الحساب الرسمي الآن" : "Connect via Meta"}
                  </Button>
                </div>
              </div>

              {/* OPTION 2: FALLBACK VIA USERNAME (APIFY) */}
              <div className="p-4 rounded-2xl border border-border/80 bg-muted/20 hover:border-border transition-all space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-foreground">
                      {isAr ? "استيراد عبر اسم المستخدم فقط (خيار بديل)" : "Import via Username Only (Fallback)"}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground">
                      {isAr ? "بدون تسجيل دخول Meta" : "No Meta Login"}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {isAr
                    ? "استيراد سريع بالاسم العام عبر فحص المنشورات المتاحة للعامة، كبديل احتياطي دون الحاجة لتسجيل دخول Meta."
                    : "Scrapes public posts using your Instagram handle without requiring Meta login."}
                </p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <div className="relative flex-1">
                    <span className="absolute start-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground select-none">
                      @
                    </span>
                    <Input
                      value={instagramHandle}
                      onChange={(e) => handleInstagramChange(e.target.value)}
                      placeholder="brand_handle"
                      className="ps-8 text-xs font-mono h-10 rounded-xl"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleStartScrape}
                    className="h-10 px-4 text-xs font-semibold shrink-0 min-h-[44px]"
                  >
                    <Sparkles className="size-3.5 me-1.5 text-muted-foreground" />
                    {isAr ? "استيراد بالاسم العام" : "Scrape by Username"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-border/60 flex items-center justify-end">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
                {isAr ? "إلغاء" : "Cancel"}
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
          <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
            <div className="size-14 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="size-8" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-base text-foreground">
                {isAr ? "تم إطلاق المتجر بنجاح!" : "Store Launched Successfully!"}
              </h4>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "تم تفعيل متجرك وتجهيز حسابك التجريبي (3 أيام مجانية)"
                  : "Your store and 3-day trial account are ready"}
              </p>
            </div>

            <div className="w-full max-w-sm bg-muted/40 border border-border/80 rounded-xl p-3.5 text-xs text-start space-y-2">
              <div className="font-bold text-foreground flex items-center gap-1.5 border-b border-border/60 pb-1.5">
                <ShieldCheck className="size-4 text-emerald-600" />
                {isAr ? "بيانات الدخول لحساب الإدارة" : "Login Credentials"}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{isAr ? "البريد الإلكتروني:" : "Email:"}</span>
                <span className="font-mono text-foreground font-semibold">{ownerEmail}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{isAr ? "رابط تسجيل الدخول:" : "Sign In URL:"}</span>
                <span className="font-mono text-primary font-semibold">boutq.store/auth</span>
              </div>
              <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                {isAr
                  ? "يمكنك تسجيل الدخول في أي وقت باستخدام بريدك الإلكتروني وكلمة المرور التي حددتها."
                  : "You can sign in anytime using your email and the password you set."}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground animate-pulse">
              {isAr ? "جاري نقلك مباشرة إلى لوحة التحكم..." : "Redirecting to your boutique dashboard..."}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
