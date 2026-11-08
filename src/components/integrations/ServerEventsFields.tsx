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
import { AD_PLATFORMS, type AdPlatformKey } from "@/lib/ad-events/platforms";
import { PLATFORM_WORDS, testResultText } from "@/lib/ad-events/platform-words";
import { cleanToken } from "@/lib/ad-events/shared";
import { testAdPlatform } from "@/lib/ad-events.functions";
import { getFriendlyErrorMessage } from "@/lib/utils";

/**
 * A platform's server events, under its pixel: the store's access token (kept encrypted with its
 * other keys, shown masked) and a test event. With a token saved, the store's server sends that
 * platform every purchase, add to bag, checkout begun and product viewed, beside the pixel
 * (`src/lib/ad-events.functions.ts`).
 */
export function ServerEventsFields({
  platform,
  brandId,
  isAr,
  pixelOn,
}: {
  platform: AdPlatformKey;
  brandId: string;
  isAr: boolean;
  pixelOn: boolean;
}) {
  const qc = useQueryClient();
  const words = PLATFORM_WORDS[platform];
  const provider = AD_PLATFORMS[platform].credential;
  const ids = { token: useId(), code: useId() };
  const credentials = useQuery(integrationsQueries.credentials(brandId));
  const saved = (credentials.data ?? []).find((row) => row.provider === provider);
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | "test" | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const t = (w: { ar: string; en: string }) => (isAr ? w.ar : w.en);

  const save = async () => {
    const clean = cleanToken(token);
    if (!clean)
      return toast.error(
        isAr
          ? "الصق رمز الوصول كما نسخته من المنصّة."
          : "Paste the access token as the platform gave it.",
      );
    setBusy("save");
    try {
      await saveIntegrationCredential(brandId, {
        id: saved?.id ?? null,
        provider,
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
      title: isAr ? `إيقاف ${t(words.serverLabel)}؟` : `Turn off the ${t(words.serverLabel)}?`,
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
      const result = await testAdPlatform({
        data: {
          brandId,
          platform,
          ...(words.testNeedsCode ? { testEventCode: code.trim() } : {}),
        },
      });
      setAnswer(testResultText(platform, result, isAr));
    } catch (error) {
      setAnswer(getFriendlyErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 grid gap-3 border-t pt-4">
      <div>
        <Label htmlFor={ids.token}>{t(words.serverLabel)}</Label>
        <p className="text-xs text-muted-foreground">{t(words.serverHelp)}</p>
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
            ? `تعمل مع ${words.name}: شغّله واحفظ معرّفه أعلاه.`
            : `It works with the ${words.name}: turn it on and save its ID above.`}
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
          placeholder={
            saved?.has_api_key ? (isAr ? "رمز جديد" : "New token") : words.tokenPlaceholder
          }
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
          {words.testNeedsCode && <Label htmlFor={ids.code}>{isAr ? "اختبار" : "Test"}</Label>}
          <div className="flex flex-wrap gap-2">
            {words.testNeedsCode && (
              <Input
                id={ids.code}
                className="min-w-0 flex-1"
                dir="ltr"
                maxLength={40}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
                placeholder="TEST12345"
              />
            )}
            <Button
              variant="outline"
              onClick={test}
              disabled={busy !== null || (words.testNeedsCode && code.trim().length < 3)}
            >
              {isAr ? "إرسال حدث تجريبي" : "Send test event"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t(words.testCodeHelp)}</p>
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
