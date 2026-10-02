import { useState } from "react";
import { AlertTriangle, CheckCircle2, Instagram, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { InstagramConnectionState } from "../hooks/use-instagram-connection";

function TokenForm({ conn, compact }: { conn: InstagramConnectionState; compact?: boolean }) {
  const { isAr } = conn;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (conn.token.trim().length >= 20) conn.connect();
      }}
    >
      {!compact && (
        <ol className="list-decimal space-y-1 ps-5 text-sm text-muted-foreground">
          <li>
            {isAr
              ? "افتح لوحة Meta للمطورين ثم تطبيق Boutq-IG."
              : "Open Meta for Developers and your Boutq-IG app."}
          </li>
          <li>
            {isAr
              ? "من Instagram ثم API setup with Instagram login اضغط Generate token بجانب الحساب."
              : "Under Instagram, API setup with Instagram login, press Generate token next to the account."}
          </li>
          <li>
            {isAr
              ? "تأكد من صلاحيتي instagram_business_basic و instagram_business_manage_comments."
              : "Make sure instagram_business_basic and instagram_business_manage_comments are granted."}
          </li>
          <li>{isAr ? "الصق الرمز هنا." : "Paste the token here."}</li>
        </ol>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="ig-token">{isAr ? "رمز انستغرام (Token)" : "Instagram token"}</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="ig-token"
            type="password"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1"
            value={conn.token}
            onChange={(event) => conn.setToken(event.target.value)}
          />
          <Button type="submit" disabled={conn.connecting || conn.token.trim().length < 20}>
            {conn.connecting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            {isAr ? "حفظ وربط" : "Save and connect"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "يُحفظ الرمز مشفراً على الخادم ولا يظهر في المتصفح بعد الحفظ."
            : "The token is stored encrypted on the server and is never shown in the browser again."}
        </p>
      </div>
      {conn.error && (
        <p role="alert" className="text-sm text-destructive">
          {conn.error}
        </p>
      )}
    </form>
  );
}

/** Who the store's Instagram is connected as, and the form for a new token. */
export function InstagramConnectionCard({ conn }: { conn: InstagramConnectionState }) {
  const { isAr } = conn;
  const [replacing, setReplacing] = useState(false);

  if (conn.loading) return <Skeleton className="h-20 w-full rounded-xl" />;

  if (!conn.connected) {
    return (
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Instagram className="size-5 text-primary" aria-hidden="true" />
          <h2 className="font-semibold text-foreground">
            {isAr ? "اربط حساب انستغرام" : "Connect Instagram"}
          </h2>
        </div>
        {conn.expired && (
          <p className="flex items-start gap-2 rounded-lg border border-warning bg-warning-subtle p-3 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {isAr
              ? "انتهت صلاحية الرمز المحفوظ. أنشئ رمزاً جديداً."
              : "The saved token has expired. Make a new one."}
          </p>
        )}
        <TokenForm conn={conn} />
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground" dir="ltr">
              @{conn.username}
            </p>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? `مربوط. ينتهي الرمز بعد ${conn.daysLeft ?? 0} يوم، ويتجدد تلقائياً عند فتح هذه الشاشة في آخر 10 أيام.`
                : `Connected. The token lapses in ${conn.daysLeft ?? 0} days, and renews itself when you open this screen in its last 10 days.`}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setReplacing((v) => !v)}>
          {isAr ? "استبدال الرمز" : "Replace token"}
        </Button>
      </div>
      {(conn.expiringSoon || conn.refreshError) && (
        <p className="flex items-start gap-2 rounded-lg border border-warning bg-warning-subtle p-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {isAr
            ? "الرمز قارب على الانتهاء. اسحب تعليقات أي مسابقة ليتجدد، أو أنشئ رمزاً جديداً من Meta."
            : "The token is close to expiring. Pull comments for any giveaway to renew it, or make a new one in Meta."}
        </p>
      )}
      {replacing && <TokenForm conn={conn} compact />}
    </section>
  );
}
