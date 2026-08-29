import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Clock3, RefreshCw, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SUPER_ADMIN_EMAIL } from "@/lib/profile-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type HealthEvent = {
  id: string;
  service: string;
  status: "healthy" | "degraded" | "failed";
  correlation_id: string | null;
  duration_ms: number | null;
  metrics: Record<string, unknown> | null;
  error_code: string | null;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/admin/super/health")({
  beforeLoad: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if ((user.email || "").toLowerCase() !== SUPER_ADMIN_EMAIL && profile?.role !== "super_admin") {
      throw redirect({ to: "/admin" });
    }
  },
  component: SystemHealthPage,
});

function SystemHealthPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const query = useQuery({
    queryKey: ["system-health-events"],
    queryFn: async () => {
      const [{ data, error }, readyResponse] = await Promise.all([
        (supabase.from("system_health_events" as never) as any)
          .select("id,service,status,correlation_id,duration_ms,metrics,error_code,created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        fetch("/api/health/ready", { cache: "no-store" }),
      ]);
      if (error) throw error;
      const readiness = (await readyResponse.json()) as {
        status: string;
        database: string;
        latencyMs: number;
      };
      return { events: (data ?? []) as HealthEvent[], readiness, readyOk: readyResponse.ok };
    },
    refetchInterval: 60_000,
  });

  const events = query.data?.events ?? [];
  const latest = Array.from(new Map(events.map((event) => [event.service, event])).values());
  const failures24h = events.filter(
    (event) =>
      event.status !== "healthy" && Date.now() - new Date(event.created_at).getTime() < 86_400_000,
  );
  const healthyServices = latest.filter((event) => event.status === "healthy").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
            <Activity className="h-7 w-7 text-primary" />
            {isAr ? "مركز صحة النظام" : "System Health Center"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAr
              ? "مراقبة مباشرة للخدمات والمهام التلقائية دون عرض بيانات العملاء."
              : "Live operational visibility without exposing customer data."}
          </p>
        </div>
        <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`me-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          {isAr ? "تحديث" : "Refresh"}
        </Button>
      </div>

      {query.isError ? (
        <Card className="border-rose-200 bg-rose-50/60">
          <CardContent className="flex items-center gap-3 p-5 text-rose-800">
            <XCircle className="h-5 w-5" />
            {isAr
              ? "تعذر تحميل بيانات المراقبة. أعد المحاولة."
              : "Could not load health data. Please retry."}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title={isAr ? "جاهزية المنصة" : "Platform readiness"}
          value={
            query.data?.readyOk
              ? isAr
                ? "جاهزة"
                : "Ready"
              : isAr
                ? "تحتاج تدخلاً"
                : "Needs attention"
          }
          healthy={query.data?.readyOk === true}
          detail={query.data ? `${query.data.readiness.latencyMs} ms` : "—"}
        />
        <SummaryCard
          title={isAr ? "الخدمات المستقرة" : "Healthy services"}
          value={`${healthyServices}/${latest.length || 0}`}
          healthy={latest.length > 0 && healthyServices === latest.length}
          detail={isAr ? "حسب آخر تشغيل" : "Based on latest run"}
        />
        <SummaryCard
          title={isAr ? "تنبيهات 24 ساعة" : "24-hour alerts"}
          value={String(failures24h.length)}
          healthy={failures24h.length === 0}
          detail={isAr ? "متعثر أو متدهور" : "Failed or degraded"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isAr ? "آخر حالة لكل خدمة" : "Latest service status"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {latest.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {isAr
                ? "ستظهر النتائج بعد أول تشغيل مجدول."
                : "Results appear after the first scheduled run."}
            </p>
          ) : (
            latest.map((event) => <ServiceRow key={event.service} event={event} isAr={isAr} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isAr ? "آخر التنبيهات" : "Recent alerts"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {failures24h.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              {isAr ? "لا توجد أعطال خلال آخر 24 ساعة" : "No incidents in the last 24 hours"}
            </div>
          ) : (
            failures24h
              .slice(0, 20)
              .map((event) => <ServiceRow key={event.id} event={event} isAr={isAr} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  detail,
  healthy,
}: {
  title: string;
  value: string;
  detail: string;
  healthy: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-black">{value}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
        {healthy ? (
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        ) : (
          <AlertTriangle className="h-8 w-8 text-amber-500" />
        )}
      </CardContent>
    </Card>
  );
}

function ServiceRow({ event, isAr }: { event: HealthEvent; isAr: boolean }) {
  const tone =
    event.status === "healthy"
      ? "bg-emerald-50 text-emerald-700"
      : event.status === "degraded"
        ? "bg-amber-50 text-amber-700"
        : "bg-rose-50 text-rose-700";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
      <div>
        <p className="font-semibold">{event.service.replaceAll("_", " ")}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          {new Date(event.created_at).toLocaleString(isAr ? "ar-BH" : "en-BH")} ·{" "}
          {event.duration_ms ?? 0} ms
        </p>
      </div>
      <div className="flex items-center gap-2">
        {event.error_code ? (
          <code className="text-xs text-muted-foreground">{event.error_code}</code>
        ) : null}
        <Badge className={tone}>{event.status}</Badge>
      </div>
    </div>
  );
}
