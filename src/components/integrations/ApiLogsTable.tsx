import { useQuery } from "@tanstack/react-query";
import { getApiRequestLogsFn } from "@/lib/public-api/public-api.functions";
import type { ApiRequestLog } from "@/lib/public-api/public-api.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Copy, Check, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

interface ApiLogsTableProps {
  brandId: string;
}

export function ApiLogsTable({ brandId }: ApiLogsTableProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["api_request_logs", brandId],
    queryFn: () => getApiRequestLogsFn({ data: { brandId, limit: 50 } }),
    refetchInterval: 15000,
  });

  const logs: (ApiRequestLog & { brand_api_keys?: { name: string; key_hint: string } | null })[] =
    data?.logs || [];

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(text);
    toast.success(isAr ? "تم نسخ المعرّف" : "Copied request ID");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) {
      return (
        <Badge variant="default" className="text-[10px] bg-green-600 hover:bg-green-600">
          {statusCode}
        </Badge>
      );
    }
    if (statusCode >= 400 && statusCode < 500) {
      return (
        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-600/30">
          {statusCode}
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="text-[10px]">
        {statusCode}
      </Badge>
    );
  };

  const getMethodBadge = (method: string) => {
    const m = method.toUpperCase();
    const colors: Record<string, string> = {
      GET: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      POST: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      PUT: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      PATCH: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      DELETE: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    };
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
          colors[m] || "bg-muted text-muted-foreground border-border"
        }`}
      >
        {m}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">
              {isAr ? "سجل تدقيق طلبات الـ API (Audit Logs)" : "API Request Audit Logs"}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? "مراقبة لحظية لجميع طلبات الـ REST API الواردة، الرموز، زمن الاستجابة، ونقاط النهاية."
              : "Real-time inspection of inbound API traffic, response latency, and status codes."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="min-h-[44px] gap-1.5"
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          {isAr ? "تحديث السجل" : "Refresh"}
        </Button>
      </div>

      {/* Logs Table */}
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">
          {isAr ? "جاري تحميل سجل الطلبات..." : "Loading API request logs..."}
        </div>
      ) : logs.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg bg-card">
          {isAr ? "لا توجد طلبات API مسجلة حتى الآن." : "No API requests recorded yet."}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto bg-card">
          <table className="w-full text-xs text-left rtl:text-right">
            <thead className="bg-muted text-muted-foreground uppercase text-[11px] font-semibold">
              <tr>
                <th className="px-4 py-3">{isAr ? "النوع" : "Method"}</th>
                <th className="px-4 py-3">{isAr ? "المسار" : "Path"}</th>
                <th className="px-4 py-3">{isAr ? "الحالة" : "Status"}</th>
                <th className="px-4 py-3">{isAr ? "المفتاح" : "Key"}</th>
                <th className="px-4 py-3">{isAr ? "المدة" : "Duration"}</th>
                <th className="px-4 py-3">{isAr ? "IP العميل" : "Client IP"}</th>
                <th className="px-4 py-3">{isAr ? "التوقيت" : "Timestamp"}</th>
                <th className="px-4 py-3 text-center">{isAr ? "معرّف الطلب" : "Request ID"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/40 transition-colors font-mono">
                  <td className="px-4 py-3">{getMethodBadge(log.method)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{log.path}</td>
                  <td className="px-4 py-3">{getStatusBadge(log.status_code)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-[11px]">
                    {log.brand_api_keys?.name ? (
                      <span>
                        {log.brand_api_keys.name} (•••{log.brand_api_keys.key_hint})
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{log.duration_ms}ms</td>
                  <td className="px-4 py-3 text-muted-foreground">{log.ip_address || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground font-sans">
                    {new Date(log.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(log.request_id)}
                      className="h-7 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                    >
                      {copiedId === log.request_id ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      <span className="truncate max-w-[70px]">{log.request_id}</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
