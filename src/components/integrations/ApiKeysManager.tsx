import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getBrandApiKeysFn,
  createBrandApiKeyFn,
  revokeBrandApiKeyFn,
} from "@/lib/public-api/public-api.functions";
import { ALL_API_SCOPES, type ApiScope, type BrandApiKey } from "@/lib/public-api/public-api.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  ShieldAlert,
  Trash2,
  Lock,
  Clock,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

interface ApiKeysManagerProps {
  brandId: string;
}

export function ApiKeysManager({ brandId }: ApiKeysManagerProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const queryClient = useQueryClient();

  // Create Key Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [selectedScopes, setSelectedScopes] = useState<ApiScope[]>([
    "products:read",
    "orders:read",
  ]);
  const [rateLimit, setRateLimit] = useState(120);

  // One-time secret reveal modal
  const [secretModalOpen, setSecretModalOpen] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [revealedKeyName, setRevealedKeyName] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Queries & Mutations
  const { data, isLoading } = useQuery({
    queryKey: ["brand_api_keys", brandId],
    queryFn: () => getBrandApiKeysFn({ data: { brandId } }),
  });

  const keys: BrandApiKey[] = data?.keys || [];

  const createMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      scopes: ApiScope[];
      rateLimitPerMinute: number;
      environment: "live" | "test";
    }) =>
      createBrandApiKeyFn({
        data: {
          brandId,
          name: payload.name,
          scopes: payload.scopes,
          rateLimitPerMinute: payload.rateLimitPerMinute,
          environment: payload.environment,
        },
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["brand_api_keys", brandId] });
      setCreateOpen(false);
      setName("");
      setSelectedScopes(["products:read", "orders:read"]);
      setRevealedSecret(res.rawSecret);
      setRevealedKeyName(res.key.name);
      setSecretModalOpen(true);
      toast.success(isAr ? "تم إنشاء مفتاح الـ API بنجاح" : "API key created successfully");
    },
    onError: (err: any) => {
      toast.error(err?.message || (isAr ? "فشل إنشاء المفتاح" : "Failed to create API key"));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) =>
      revokeBrandApiKeyFn({
        data: { brandId, keyId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand_api_keys", brandId] });
      toast.success(isAr ? "تم تعطيل المفتاح" : "API key revoked");
    },
    onError: (err: any) => {
      toast.error(err?.message || (isAr ? "فشل تعطيل المفتاح" : "Failed to revoke key"));
    },
  });

  const toggleScope = (scope: ApiScope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const handleCopySecret = async () => {
    if (!revealedSecret) return;
    await navigator.clipboard.writeText(revealedSecret);
    setCopied(true);
    toast.success(isAr ? "تم نسخ المفتاح إلى الحافظة" : "API key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">
              {isAr ? "مفاتيح الـ API الموثقة (API Keys)" : "Developer API Keys"}
            </h3>
            <Badge variant="outline" className="text-xs">
              REST v1
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? "أنشئ مفاتيح موثقة بصلاحيات مخصصة لربط تطبيقاتك أو أنظمتك الخارجية بأمان تام عبر SHA-256."
              : "Generate cryptographically-hashed scoped API keys to safely integrate external apps & ERPs."}
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="min-h-[44px] gap-2 px-5 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          {isAr ? "إنشاء مفتاح جديد" : "Create New Key"}
        </Button>
      </div>

      {/* Keys List */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            {isAr ? "جاري تحميل المفاتيح..." : "Loading API keys..."}
          </div>
        ) : keys.length === 0 ? (
          <Card className="border-dashed border-border p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h4 className="mt-4 text-base font-medium text-foreground">
              {isAr ? "لا توجد مفاتيح API بعد" : "No API keys created yet"}
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAr
                ? "ابدأ بإنشاء مفتاح API لربط متجرك بـ Zapier أو منصات التجارة أو تطبيق الجوال."
                : "Create an API key to connect your store with third-party tools, mobile apps, or Zapier."}
            </p>
            <Button onClick={() => setCreateOpen(true)} variant="outline" className="mt-4 min-h-[44px]">
              <Plus className="mr-2 h-4 w-4" />
              {isAr ? "إنشاء أول مفتاح" : "Create First Key"}
            </Button>
          </Card>
        ) : (
          keys.map((k) => (
            <Card key={k.id} className="border-border">
              <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-foreground text-base">{k.name}</span>
                    <Badge variant={k.is_active ? "default" : "secondary"} className="text-xs">
                      {k.is_active
                        ? isAr
                          ? "نشط"
                          : "Active"
                        : isAr
                          ? "معطل"
                          : "Revoked"}
                    </Badge>
                    <Badge variant="outline" className="text-xs font-mono">
                      {k.key_prefix}••••{k.key_hint}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {k.scopes.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-muted text-muted-foreground border border-border"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {isAr ? "الحد:" : "Limit:"} {k.rate_limit_per_minute} {isAr ? "طلب/دقيقة" : "req/min"}
                    </span>
                    <span>•</span>
                    <span>
                      {isAr ? "آخر استخدام:" : "Last used:"}{" "}
                      {k.last_used_at
                        ? new Date(k.last_used_at).toLocaleDateString(isAr ? "ar-SA" : "en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : isAr
                          ? "لم يُستخدم بعد"
                          : "Never"}
                    </span>
                  </div>
                </div>

                {k.is_active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (
                        confirm(
                          isAr
                            ? "هل أنت متأكد من رغبتك في تعطيل هذا المفتاح؟ لن تتمكن أي جهة من استخدامه بعد الآن."
                            : "Are you sure you want to revoke this API key? Any applications using it will immediately lose access.",
                        )
                      ) {
                        revokeMutation.mutate(k.id);
                      }
                    }}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 min-h-[44px]"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    {isAr ? "تعطيل المفتاح" : "Revoke Key"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create Key Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <KeyRound className="h-5 w-5 text-primary" />
              {isAr ? "إنشاء مفتاح API جديد" : "Create New API Key"}
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? "حدد اسماً واضحاً ومجموعة الصلاحيات (Scopes) اللازمة لهذا المفتاح."
                : "Provide a descriptive name and select the minimal required scopes for this API key."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">{isAr ? "اسم المفتاح" : "Key Name"}</Label>
              <Input
                id="key-name"
                placeholder={isAr ? "مثال: تطبيق الجوال أو رابط المحاسبة" : "e.g. Mobile App, Shopify Sync"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-h-[44px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isAr ? "البيئة" : "Environment"}</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={environment === "live" ? "default" : "outline"}
                    onClick={() => setEnvironment("live")}
                    className="flex-1 min-h-[44px]"
                  >
                    Live (bq_live_)
                  </Button>
                  <Button
                    type="button"
                    variant={environment === "test" ? "default" : "outline"}
                    onClick={() => setEnvironment("test")}
                    className="flex-1 min-h-[44px]"
                  >
                    Test (bq_test_)
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rate-limit">{isAr ? "الحد الأقصى للطلبات (في الدقيقة)" : "Rate Limit (req/min)"}</Label>
                <Input
                  id="rate-limit"
                  type="number"
                  min={10}
                  max={1000}
                  value={rateLimit}
                  onChange={(e) => setRateLimit(Number(e.target.value))}
                  className="min-h-[44px]"
                />
              </div>
            </div>

            {/* Granular Scopes Checklist */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">{isAr ? "الصلاحيات الممنوحة (Scopes)" : "Granted Permissions (Scopes)"}</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="p-0 h-auto text-xs text-primary"
                    onClick={() => setSelectedScopes(ALL_API_SCOPES.map((s) => s.scope))}
                  >
                    {isAr ? "تحديد الكل" : "Select All"}
                  </Button>
                  <span className="text-muted-foreground text-xs">•</span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="p-0 h-auto text-xs text-muted-foreground"
                    onClick={() => setSelectedScopes([])}
                  >
                    {isAr ? "إلغاء التحديد" : "Deselect All"}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1 border border-border rounded-lg">
                {ALL_API_SCOPES.map((item) => {
                  const isChecked = selectedScopes.includes(item.scope);
                  return (
                    <div
                      key={item.scope}
                      onClick={() => toggleScope(item.scope)}
                      className={`flex items-start gap-2.5 p-2.5 rounded-md cursor-pointer border transition-colors ${
                        isChecked
                          ? "bg-primary/5 border-primary/30"
                          : "bg-card border-border hover:bg-muted/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                      />
                      <div className="space-y-0.5 text-xs">
                        <div className="font-mono font-medium text-foreground">{item.scope}</div>
                        <div className="text-muted-foreground">{isAr ? item.labelAr : item.labelEn}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              className="min-h-[44px]"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => {
                if (!name.trim()) {
                  toast.error(isAr ? "يرجى كتابة اسم للمفتاح" : "Please enter a key name");
                  return;
                }
                createMutation.mutate({
                  name,
                  scopes: selectedScopes,
                  rateLimitPerMinute: rateLimit,
                  environment,
                });
              }}
              disabled={createMutation.isPending}
              className="min-h-[44px] gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {createMutation.isPending
                ? isAr
                  ? "جاري الإنشاء والتشفير..."
                  : "Creating & Hashing..."
                : isAr
                  ? "إنشاء المفتاح وحفظه"
                  : "Create API Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret Reveal Modal (One-time Display) */}
      <Dialog open={secretModalOpen} onOpenChange={setSecretModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              {isAr ? "انسخ مفتاح الـ API الآن" : "Save Your API Secret Key"}
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? `تم إنشاء المفتاح "${revealedKeyName}" وتشفيره بنجاح. لن تتمكن من رؤية هذا السر مرة أخرى!`
                : `Key "${revealedKeyName}" created. For security, you will NEVER be able to see this secret again!`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {isAr
                  ? "يتم تخزين تجزئة SHA-256 المشفرة فقط في قاعدة البيانات. انسخ هذا المفتاح وضعه في ملف بيئة التطبيق أو إعدادات الربط الآن."
                  : "We only store the salted SHA-256 cryptographic hash. Store this secret securely in your .env or connector config."}
              </span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{isAr ? "المفتاح السري (Secret Key)" : "Secret Key"}</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={revealedSecret || ""}
                  className="font-mono text-xs bg-muted min-h-[44px]"
                />
                <Button
                  onClick={handleCopySecret}
                  className="min-h-[44px] min-w-[44px] px-3 gap-1.5"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? (isAr ? "تم النسخ" : "Copied") : (isAr ? "نسخ" : "Copy")}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setSecretModalOpen(false);
                setRevealedSecret(null);
              }}
              className="w-full min-h-[44px]"
            >
              {isAr ? "لقد حفظت المفتاح بأمان، إغلاق" : "I have securely stored the key, Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
