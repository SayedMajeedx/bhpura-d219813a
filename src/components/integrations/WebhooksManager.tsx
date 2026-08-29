import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getWebhookEndpointsFn,
  createWebhookEndpointFn,
  deleteWebhookEndpointFn,
  testWebhookPingFn,
  getWebhookDeliveryLogsFn,
} from "@/lib/public-api/public-api.functions";
import {
  ALL_WEBHOOK_EVENTS,
  type WebhookEventName,
  type WebhookEndpoint,
  type WebhookDeliveryLog,
} from "@/lib/public-api/public-api.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Webhook,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Radio,
  Eye,
  AlertOctagon,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

interface WebhooksManagerProps {
  brandId: string;
}

export function WebhooksManager({ brandId }: WebhooksManagerProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const queryClient = useQueryClient();

  // Create Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<WebhookEventName[]>([
    "order.created",
    "order.updated",
  ]);

  // Logs / Payload Inspection Modal
  const [selectedLog, setSelectedLog] = useState<WebhookDeliveryLog | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);

  // Queries
  const { data: endpointsData, isLoading: endpointsLoading } = useQuery({
    queryKey: ["webhook_endpoints", brandId],
    queryFn: () => getWebhookEndpointsFn({ data: { brandId } }),
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ["webhook_delivery_logs", brandId],
    queryFn: () => getWebhookDeliveryLogsFn({ data: { brandId, limit: 30 } }),
    refetchInterval: 10000, // refresh delivery logs every 10s
  });

  const endpoints: WebhookEndpoint[] = endpointsData?.endpoints || [];
  const deliveryLogs: WebhookDeliveryLog[] = logsData?.logs || [];

  // Mutations
  const createMutation = useMutation({
    mutationFn: () =>
      createWebhookEndpointFn({
        data: {
          brandId,
          url,
          description,
          subscribedEvents: selectedEvents,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhook_endpoints", brandId] });
      setCreateOpen(false);
      setUrl("");
      setDescription("");
      toast.success(isAr ? "تمت إضافة الـ Webhook بنجاح" : "Webhook endpoint added");
    },
    onError: (err: any) => {
      toast.error(err?.message || (isAr ? "فشل إضافة الـ Webhook" : "Failed to add endpoint"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (endpointId: string) =>
      deleteWebhookEndpointFn({
        data: { brandId, endpointId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhook_endpoints", brandId] });
      toast.success(isAr ? "تم حذف الـ Webhook" : "Endpoint deleted");
    },
  });

  const testPingMutation = useMutation({
    mutationFn: (endpointId: string) =>
      testWebhookPingFn({
        data: { brandId, endpointId },
      }),
    onSuccess: (res) => {
      setTestResult(res);
      queryClient.invalidateQueries({ queryKey: ["webhook_delivery_logs", brandId] });
      if (res.success) {
        toast.success(
          isAr
            ? `وصل الـ Ping بنجاح (رمز الحالة: ${res.statusCode}, المدة: ${res.durationMs}ms)`
            : `Ping successful (Status ${res.statusCode}, ${res.durationMs}ms)`,
        );
      } else {
        toast.error(
          isAr
            ? `فشل إرسال الـ Ping (${res.error || `رمز الحالة: ${res.statusCode}`})`
            : `Ping failed (${res.error || `Status: ${res.statusCode}`})`,
        );
      }
    },
  });

  const toggleEvent = (event: WebhookEventName) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  return (
    <div className="space-y-8">
      {/* Webhooks Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">
              {isAr ? "خطافات الويب (Webhooks & Event Subscriptions)" : "Webhook Subscriptions"}
            </h3>
            <Badge variant="outline" className="text-xs">
              HMAC SHA-256
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? "استقبل إشعارات لحظية وموقّعة بـ HMAC في سيرفراتك عند حدوث أي طلب جديد، تعديل مخزون، أو مرتجع."
              : "Receive real-time signed HTTP POST payloads whenever store events occur."}
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="min-h-[44px] gap-2 px-5 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          {isAr ? "إضافة رابط جديد" : "Add Endpoint"}
        </Button>
      </div>

      {/* Endpoints List */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          {isAr ? "الروابط المسجلة" : "Configured Endpoints"} ({endpoints.length})
        </h4>

        {endpointsLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            {isAr ? "جاري تحميل الروابط..." : "Loading endpoints..."}
          </div>
        ) : endpoints.length === 0 ? (
          <Card className="border-dashed border-border p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Radio className="h-6 w-6 text-muted-foreground" />
            </div>
            <h4 className="mt-4 text-base font-medium text-foreground">
              {isAr ? "لا توجد روابط Webhooks مسجلة" : "No Webhooks Configured"}
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAr
                ? "سجّل رابط HTTPS لاستقبال تنبيهات الطلبات والمخزون مباشرة."
                : "Register an HTTPS endpoint to automatically receive webhook dispatches."}
            </p>
            <Button onClick={() => setCreateOpen(true)} variant="outline" className="mt-4 min-h-[44px]">
              <Plus className="mr-2 h-4 w-4" />
              {isAr ? "إضافة أول رابط" : "Add Endpoint"}
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {endpoints.map((ep) => (
              <Card key={ep.id} className="border-border">
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-mono text-sm font-medium text-foreground">
                        <span className="truncate max-w-md">{ep.url}</span>
                        <Badge variant={ep.is_active ? "default" : "destructive"} className="text-xs">
                          {ep.is_active ? (isAr ? "نشط" : "Active") : (isAr ? "معطل" : "Disabled")}
                        </Badge>
                        {ep.consecutive_failures > 0 && (
                          <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">
                            <AlertOctagon className="h-3 w-3 mr-1" />
                            {ep.consecutive_failures} {isAr ? "فشل متتالي" : "consecutive failures"}
                          </Badge>
                        )}
                      </div>
                      {ep.description && (
                        <p className="text-xs text-muted-foreground">{ep.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={testPingMutation.isPending}
                        onClick={() => testPingMutation.mutate(ep.id)}
                        className="min-h-[44px] gap-1.5"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {isAr ? "إرسال تجربة Ping" : "Test Ping"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(isAr ? "هل أنت متأكد من حذف هذا الرابط؟" : "Delete this webhook?")) {
                            deleteMutation.mutate(ep.id);
                          }
                        }}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 min-h-[44px]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Subscribed Events */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border">
                    <span className="text-xs font-semibold text-muted-foreground mr-1">
                      {isAr ? "الأحداث المشتركة:" : "Subscribed:"}
                    </span>
                    {ep.subscribed_events.map((ev) => (
                      <span
                        key={ev}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-muted text-muted-foreground border border-border"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delivery Logs Table */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h4 className="text-base font-semibold text-foreground">
              {isAr ? "سجل إرسال الـ Webhooks المباشر" : "Live Delivery & Attempt History"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "يتم تحديث سجل المحاولات وتواقيع HMAC وحالات الاستجابة تلقائياً كل 10 ثوانٍ."
                : "Real-time log of all signed event dispatches, response HTTP status, and payloads."}
            </p>
          </div>
        </div>

        {logsLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {isAr ? "جاري تحميل سجلات الإرسال..." : "Loading logs..."}
          </div>
        ) : deliveryLogs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
            {isAr ? "لا توجد سجلات إرسال حتى الآن." : "No delivery logs recorded yet."}
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-x-auto bg-card">
            <table className="w-full text-xs text-left rtl:text-right">
              <thead className="bg-muted text-muted-foreground uppercase text-[11px] font-semibold">
                <tr>
                  <th className="px-4 py-3">{isAr ? "الحدث" : "Event"}</th>
                  <th className="px-4 py-3">{isAr ? "الحالة" : "Status"}</th>
                  <th className="px-4 py-3">{isAr ? "رمز الاستجابة" : "HTTP Status"}</th>
                  <th className="px-4 py-3">{isAr ? "المدة" : "Duration"}</th>
                  <th className="px-4 py-3">{isAr ? "التوقيت" : "Timestamp"}</th>
                  <th className="px-4 py-3 text-center">{isAr ? "البيانات" : "Payload"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {deliveryLogs.map((log) => {
                  const isSuccess = log.status === "delivered" || (log.response_status && log.response_status < 400);
                  return (
                    <tr key={log.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground">
                        {log.event_name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 font-medium">
                          {isSuccess ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-destructive" />
                          )}
                          <span className={isSuccess ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                            {log.status}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {log.response_status ? (
                          <Badge
                            variant={log.response_status < 300 ? "default" : "destructive"}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {log.response_status}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono">
                        {log.duration_ms !== null ? `${log.duration_ms}ms` : "-"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
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
                          onClick={() => setSelectedLog(log)}
                          className="h-8 w-8 p-0"
                        >
                          <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Webhook Endpoint Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Webhook className="h-5 w-5 text-primary" />
              {isAr ? "إضافة رابط Webhook جديد" : "Add Webhook Endpoint"}
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? "أدخل رابط HTTPS الخاص بسيرفرك، واختر الأحداث التي ترغب في الاستماع إليها."
                : "Specify an HTTPS destination URL and select event triggers to subscribe to."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label htmlFor="webhook-url">{isAr ? "رابط الـ Webhook (HTTPS فقط)" : "Endpoint URL (HTTPS)"}</Label>
              <Input
                id="webhook-url"
                type="url"
                placeholder="https://api.yourdomain.com/webhooks/boutq"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="min-h-[44px] font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook-desc">{isAr ? "الوصف (اختياري)" : "Description (Optional)"}</Label>
              <Input
                id="webhook-desc"
                placeholder={isAr ? "مثال: سيرفر الشحن أو نظام ERP" : "e.g. ERP integration or shipping bot"}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[44px]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">{isAr ? "الأحداث المتاحة للاشتراك" : "Event Subscriptions"}</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 border border-border rounded-lg">
                {ALL_WEBHOOK_EVENTS.map((item) => {
                  const isChecked = selectedEvents.includes(item.event);
                  return (
                    <div
                      key={item.event}
                      onClick={() => toggleEvent(item.event)}
                      className={`flex items-start gap-2.5 p-2 rounded-md cursor-pointer border transition-colors ${
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
                        <div className="font-mono font-medium text-foreground">{item.event}</div>
                        <div className="text-muted-foreground">{isAr ? item.labelAr : item.labelEn}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="min-h-[44px]">
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => {
                if (!url.startsWith("https://") && !url.startsWith("http://localhost")) {
                  toast.error(isAr ? "يجب أن يبدأ الرابط بـ https://" : "URL must start with https://");
                  return;
                }
                createMutation.mutate();
              }}
              disabled={createMutation.isPending}
              className="min-h-[44px]"
            >
              {isAr ? "حفظ وتفعيل الرابط" : "Save Endpoint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payload Inspection Modal */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-base font-bold">
              {selectedLog?.event_name} • {selectedLog?.event_id}
            </DialogTitle>
            <DialogDescription>
              {isAr ? "تفاصيل حمولة الحدث واستجابة السيرفر" : "Dispatched JSON payload and target server response"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">{isAr ? "الحمولة المرسلة (Payload)" : "Dispatched Payload"}</Label>
              <pre className="p-3 bg-muted rounded-lg font-mono text-xs overflow-x-auto max-h-60 border border-border">
                {JSON.stringify(selectedLog?.payload, null, 2)}
              </pre>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">{isAr ? "استجابة السيرفر المستلم" : "Target Server Response"}</Label>
              <div className="p-3 bg-muted/60 rounded-lg font-mono text-xs overflow-x-auto border border-border">
                {selectedLog?.response_body || (isAr ? "لا توجد استجابة مسجلة" : "No response body")}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLog(null)} className="min-h-[44px]">
              {isAr ? "إغلاق" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
