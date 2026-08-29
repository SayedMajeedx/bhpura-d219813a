import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MessageSquare, Mail, Bell, CheckCircle2, AlertTriangle } from "lucide-react";
import type { AbandonedCartDispatchLog } from "@/lib/abandoned-carts.types";

interface AbandonedCartLogsTableProps {
  logs: AbandonedCartDispatchLog[];
  isLoading: boolean;
}

export function AbandonedCartLogsTable({ logs, isLoading }: AbandonedCartLogsTableProps) {
  const { lang, t } = useI18n();
  const isAr = lang === "ar";

  const getChannelBadge = (ch: string) => {
    switch (ch) {
      case "whatsapp":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>WhatsApp</span>
          </span>
        );
      case "email":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400">
            <Mail className="h-3.5 w-3.5" />
            <span>Email</span>
          </span>
        );
      case "push":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 dark:text-purple-400">
            <Bell className="h-3.5 w-3.5" />
            <span>Push</span>
          </span>
        );
      default:
        return <span>{ch}</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" />
            {isAr ? "تم الإرسال" : "Sent"}
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <AlertTriangle className="h-3 w-3" />
            {isAr ? "فشل" : "Failed"}
          </span>
        );
      case "skipped_opt_out":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
            {isAr ? "تم التخطي (عدم موافقة)" : "Opted-out"}
          </span>
        );
      case "skipped_recovered":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-600 border border-sky-500/20">
            {isAr ? "تم التخطي (اكتمل الطلب)" : "Order Placed"}
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <Card className="border-border overflow-hidden bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>{isAr ? "القناة" : "Channel"}</TableHead>
              <TableHead>{isAr ? "المستلم" : "Recipient"}</TableHead>
              <TableHead>{isAr ? "خطوة التسلسل" : "Sequence Step"}</TableHead>
              <TableHead>{isAr ? "كود الخصم المرفق" : "Attached Coupon"}</TableHead>
              <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
              <TableHead>{isAr ? "وقت الإرسال" : "Sent At"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                  {isLoading
                    ? isAr
                      ? "جاري تحميل سجل الإرسال..."
                      : "Loading dispatch logs..."
                    : isAr
                    ? "لا توجد رسائل استعادة مرسلة حتى الآن."
                    : "No recovery dispatch logs recorded yet."}
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} className="border-border">
                  <TableCell>{getChannelBadge(log.channel)}</TableCell>
                  <TableCell className="font-mono text-xs text-foreground">
                    {log.recipient}
                  </TableCell>
                  <TableCell className="text-xs font-semibold text-foreground">
                    {isAr ? `الخطوة #${log.step_number}` : `Step #${log.step_number}`}
                  </TableCell>
                  <TableCell>
                    {log.discount_code ? (
                      <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                        {log.discount_code}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(log.status)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.sent_at).toLocaleDateString(isAr ? "ar-BH" : "en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
