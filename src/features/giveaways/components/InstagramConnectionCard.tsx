import { useState } from "react";
import { AlertTriangle, CheckCircle2, Instagram, KeyRound, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { InstagramConnectionState } from "../hooks/use-instagram-connection";

/** The result Instagram sent the browser back with (connected, or why not). */
function Notice({ conn }: { conn: InstagramConnectionState }) {
  if (!conn.notice) return null;
  const ok = conn.notice.kind === "success";
  return (
    <div
      role={ok ? "status" : "alert"}
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm text-foreground ${
        ok ? "border-success bg-success-subtle" : "border-warning bg-warning-subtle"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <span className="flex-1">{conn.notice.text}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        onClick={conn.dismissNotice}
        aria-label={conn.isAr ? "إغلاق" : "Dismiss"}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

function ConnectButton({ conn, label }: { conn: InstagramConnectionState; label: string }) {
  return (
    <Button type="button" onClick={conn.startOAuth} disabled={conn.startingOAuth}>
      {conn.startingOAuth ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Instagram className="size-4" />
      )}
      {label}
    </Button>
  );
}

/** The fallback: paste a token made by hand in Meta's dashboard. */
function TokenForm({ conn }: { conn: InstagramConnectionState }) {
  const { isAr } = conn;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (conn.token.trim().length >= 20) conn.connect();
      }}
    >
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
          <Button
            type="submit"
            variant="outline"
            disabled={conn.connecting || conn.token.trim().length < 20}
          >
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

function ManualToken({ conn }: { conn: InstagramConnectionState }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">
        {conn.isAr ? "متقدم: ربط برمز يدوي" : "Advanced: connect with a token by hand"}
      </summary>
      <div className="mt-3">
        <TokenForm conn={conn} />
      </div>
    </details>
  );
}

/** Who the store's Instagram is connected as, and how to connect or reconnect it. */
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
        <Notice conn={conn} />
        {conn.expired && (
          <p className="flex items-start gap-2 rounded-lg border border-warning bg-warning-subtle p-3 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {isAr
              ? "انتهت صلاحية الربط المحفوظ. أعد الربط."
              : "The saved connection has expired. Connect again."}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "سيفتح انستغرام لتوافق على قراءة التعليقات. لا يُحفظ أي رمز في المتصفح."
            : "Instagram opens so you can approve reading comments. No token is kept in the browser."}
        </p>
        <ConnectButton conn={conn} label={isAr ? "ربط انستغرام" : "Connect with Instagram"} />
        <ManualToken conn={conn} />
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <Notice conn={conn} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground" dir="ltr">
              @{conn.username}
            </p>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? `مربوط. ينتهي الربط بعد ${conn.daysLeft ?? 0} يوم، ويتجدد تلقائياً عند فتح هذه الشاشة في آخر 10 أيام.`
                : `Connected. The connection lapses in ${conn.daysLeft ?? 0} days, and renews itself when you open this screen in its last 10 days.`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ConnectButton conn={conn} label={isAr ? "إعادة الربط" : "Reconnect"} />
          <Button type="button" variant="outline" size="sm" onClick={() => setReplacing((v) => !v)}>
            {isAr ? "استبدال الرمز" : "Replace token"}
          </Button>
        </div>
      </div>
      {(conn.expiringSoon || conn.refreshError) && (
        <p className="flex items-start gap-2 rounded-lg border border-warning bg-warning-subtle p-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {isAr
            ? "الربط قارب على الانتهاء. اسحب تعليقات أي مسابقة ليتجدد، أو اضغط «إعادة الربط»."
            : "The connection is close to expiring. Pull comments for any giveaway to renew it, or press Reconnect."}
        </p>
      )}
      {replacing && <TokenForm conn={conn} />}
    </section>
  );
}
