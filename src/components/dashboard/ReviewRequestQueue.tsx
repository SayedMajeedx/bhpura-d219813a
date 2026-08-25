import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, MessageCircle, Star, CheckCheck, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhoneForWhatsApp } from "@/lib/courier-whatsapp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ReviewRequest = {
  request_id: string;
  order_id: string;
  invoice_number: number;
  customer_name: string;
  customer_phone: string;
  eligible_at: string;
  request_status: "ready" | "whatsapp_opened" | "sent";
  review_url_token: string;
};

export function ReviewRequestQueue({
  brandId,
  brandName,
  isAr,
}: {
  brandId: string;
  brandName: string;
  isAr: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["ready-order-review-requests", brandId];
  const requestQ = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("list_ready_order_review_requests", {
        p_brand_id: brandId,
      });
      if (error) throw error;
      return (data ?? []) as ReviewRequest[];
    },
    refetchInterval: 60_000,
  });

  const updateStatus = async (
    requestId: string,
    status: "whatsapp_opened" | "sent" | "dismissed",
  ) => {
    const { error } = await (supabase.rpc as any)("update_order_review_request_status", {
      p_request_id: requestId,
      p_status: status,
    });
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey });
  };

  const openWhatsApp = async (request: ReviewRequest) => {
    const phone = normalizePhoneForWhatsApp(request.customer_phone);
    if (!phone) {
      toast.error(
        isAr ? "رقم واتساب العميل غير صالح" : "The customer's WhatsApp number is invalid",
      );
      return;
    }
    const reviewUrl = `${window.location.origin}/review/${request.review_url_token}`;
    const message = isAr
      ? `هلا ${request.customer_name} 🌿\n\nسعدنا بخدمتك في ${brandName}، ونتمنى أن طلبك رقم ${request.invoice_number} نال رضاك.\n\nشاركنا رأيك بتقييم سريع لا يستغرق أكثر من 30 ثانية، وبعد إكماله ستحصل على خصم 10% على طلبك القادم 🎁\n\n${reviewUrl}\n\nرأيك يفرق معنا ويساعدنا نقدم لك تجربة أجمل دائمًا 🤍`
      : `Hi ${request.customer_name} 🌿\n\nWe loved serving you at ${brandName}. Share a quick review of order #${request.invoice_number} in under 30 seconds and receive 10% off your next order 🎁\n\n${reviewUrl}\n\nYour feedback helps us make every experience better 🤍`;
    const popup = window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
    if (!popup) {
      toast.error(
        isAr
          ? "تعذر فتح واتساب. اسمح بالنوافذ المنبثقة وحاول مجددًا."
          : "Could not open WhatsApp. Allow popups and try again.",
      );
      return;
    }
    try {
      await updateStatus(request.request_id, "whatsapp_opened");
    } catch {
      toast.error(
        isAr
          ? "فُتح واتساب، لكن تعذر حفظ الحالة"
          : "WhatsApp opened, but status could not be saved",
      );
    }
  };

  if (requestQ.isLoading || !requestQ.data?.length) return null;

  return (
    <Card className="border-primary/20 bg-card shadow-sm">
      <CardHeader className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Star className="size-4" />
              </span>
              {isAr ? "تقييمات جاهزة للإرسال" : "Reviews ready to request"}
            </CardTitle>
            <CardDescription>
              {isAr
                ? "مرّت 3 أيام على اكتمال هذه الطلبات."
                : "These orders were completed 3 days ago."}
            </CardDescription>
          </div>
          <Badge variant="secondary">{requestQ.data.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {requestQ.data.map((request) => (
          <div
            key={request.request_id}
            className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span>{request.customer_name}</span>
                <span className="text-muted-foreground">#{request.invoice_number}</span>
                {request.request_status === "sent" && (
                  <Badge variant="outline" className="gap-1">
                    <CheckCheck className="size-3" />
                    {isAr ? "تم الإرسال" : "Sent"}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                <Gift className="me-1 inline size-3" />
                {isAr ? "تقييم 30 ثانية • خصم THANKU10" : "30-second review • THANKU10 reward"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="min-h-11 gap-2"
                onClick={() => openWhatsApp(request)}
              >
                <MessageCircle className="size-4" />
                {isAr ? "فتح واتساب" : "Open WhatsApp"}
              </Button>
              {request.request_status !== "sent" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  onClick={() =>
                    updateStatus(request.request_id, "sent").then(() =>
                      toast.success(isAr ? "تم تأكيد الإرسال" : "Marked as sent"),
                    )
                  }
                >
                  {isAr ? "تأكيد الإرسال" : "Mark sent"}
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={isAr ? "تجاهل" : "Dismiss"}
                onClick={() => updateStatus(request.request_id, "dismissed")}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
