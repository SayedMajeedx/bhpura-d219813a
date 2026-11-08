import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  deleteIntegrationCredential,
  integrationsQueries,
  invalidateIntegrationCredentials,
  saveIntegrationCredential,
} from "@/lib/data/integrations";
import { META_CAPI_PROVIDER, cleanToken, type SendResult } from "@/lib/ad-events/meta-conversions";
import { testMetaConversions } from "@/lib/ad-events.functions";
import { getFriendlyErrorMessage } from "@/lib/utils";

/** What a test answered, in the merchant's language. */
export function testResultText(result: SendResult, isAr: boolean): string {
  if (result.sent)
    return isAr
      ? "وصل الحدث. افتح «اختبار الأحداث» في مدير الأحداث لتراه."
      : "Meta received the event. Open Test events in Events Manager to see it.";
  if (result.reason === "off")
    return isAr
      ? "شغّل Meta Pixel واحفظ رمز الوصول أولاً."
      : "Turn on the Meta Pixel and save the access token first.";
  if (result.reason === "refused")
    return isAr
      ? `رفضت Meta الحدث: ${result.detail ?? ""}`
      : `Meta refused the event: ${result.detail ?? ""}`;
  return isAr ? "تعذّر الوصول إلى Meta، حاول لاحقاً." : "Could not reach Meta. Try again later.";
}

/**
 * Meta's Conversions API, under the pixel: the store's access token (kept encrypted with its other
 * keys, shown masked) and a test event under Events Manager's code. With a token saved, the
 * store's server sends Meta every purchase, add to bag, checkout begun and product viewed, beside
 * the pixel (`src/lib/ad-events.functions.ts`).
 */
export function MetaConversionsFields({
  brandId,
  isAr,
  pixelOn,
}: {
  brandId: string;
  isAr: boolean;
  pixelOn: boolean;
}) {
  const qc = useQueryClient();
  const ids = { token: useId(), code: useId() };
  const credentials = useQuery(integrationsQueries.credentials(brandId));
  const saved = (credentials.data ?? []).find((row) => row.provider === META_CAPI_PROVIDER);
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | "test" | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);

  const save = async () => {
    const clean = cleanToken(token);
    if (!clean)
      return toast.error(
        isAr ? "الصق رمز الوصول كما نسخته من Meta." : "Paste the access token as Meta gave it.",
      );
    setBusy("save");
    try {
      await saveIntegrationCredential(brandId, {
        id: saved?.id ?? null,
        provider: META_CAPI_PROVIDER,
        baseUrl: null,
        apiKey: clean,
        webhookSecret: "",
        isActive: true,
        notes: null,
      });
      setToken("");
      await invalidateIntegrationCredentials(qc, brandId);
      toast.success(isAr ? "تم حفظ رمز الوصول" : "Access token saved");
    } catch (error) {
      toast.error(getFriendlyErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!saved) return;
    const ok = await confirmDialog({
      title: isAr ? "إيقاف واجهة التحويلات؟" : "Turn off the Conversions API?",
      description: isAr
        ? "يُحذف رمز الوصول، ويبقى البكسل في المتصفح وحده."
        : "The access token is deleted; the browser pixel carries on alone.",
      destructive: true,
    });
    if (!ok) return;
    setBusy("remove");
    try {
      await deleteIntegrationCredential(brandId, saved.id);
      await invalidateIntegrationCredentials(qc, brandId);
      setAnswer(null);
    } catch (error) {
      toast.error(getFriendlyErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    setAnswer(null);
    try {
      const result = await testMetaConversions({ data: { brandId, testEventCode: code.trim() } });
      setAnswer(testResultText(result, isAr));
    } catch (error) {
      setAnswer(getFriendlyErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 grid gap-3 border-t pt-4">
      <div>
        <Label htmlFor={ids.token}>
          {isAr ? "واجهة التحويلات (من الخادم)" : "Conversions API (server-side)"}
        </Label>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "يرسل خادم المتجر المشتريات وأحداث التسوّق إلى Meta، فتُحسب حتى حين يُحجب البكسل على آيفون أو داخل إنستغرام. أنشئ الرمز من مدير الأحداث ← الإعدادات ← واجهة التحويلات."
            : "The store's server sends Meta every purchase and shopping step, so sales count even when the pixel is blocked on an iPhone or inside Instagram. Create the token in Events Manager → Settings → Conversions API."}
        </p>
      </div>
      {saved?.has_api_key && (
        <p className="text-xs" dir="ltr">
          <span className="text-muted-foreground">
            {isAr ? "الرمز المحفوظ: " : "Saved token: "}
          </span>
          <span className="font-mono">{saved.api_key_masked}</span>
        </p>
      )}
      {!pixelOn && (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "تعمل مع Meta Pixel: شغّله واحفظ معرّفه أعلاه."
            : "It works with the Meta Pixel: turn it on and save its ID above."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Input
          id={ids.token}
          className="min-w-0 flex-1"
          dir="ltr"
          type="password"
          autoComplete="off"
          maxLength={1000}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={saved?.has_api_key ? (isAr ? "رمز جديد" : "New token") : "EAAG…"}
        />
        <Button variant="outline" onClick={save} disabled={busy !== null || !token.trim()}>
          {isAr ? "حفظ الرمز" : "Save token"}
        </Button>
        {saved && (
          <Button variant="ghost" onClick={remove} disabled={busy !== null}>
            {isAr ? "إيقاف" : "Turn off"}
          </Button>
        )}
      </div>
      {saved?.has_api_key && (
        <div className="grid gap-2">
          <Label htmlFor={ids.code}>{isAr ? "اختبار" : "Test"}</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id={ids.code}
              className="min-w-0 flex-1"
              dir="ltr"
              maxLength={40}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
              placeholder="TEST12345"
            />
            <Button
              variant="outline"
              onClick={test}
              disabled={busy !== null || code.trim().length < 3}
            >
              {isAr ? "إرسال حدث تجريبي" : "Send test event"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "انسخ رمز الاختبار من تبويب «اختبار الأحداث» في مدير الأحداث."
              : "Copy the test code from the Test events tab in Events Manager."}
          </p>
          {answer && (
            <p className="text-sm" role="status">
              {answer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
