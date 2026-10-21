import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ShoppingCart, Clock, Loader2, Sparkles } from "lucide-react";
import type { BrandAbandonedCartSettings } from "@/lib/abandoned-carts.types";
import {
  invalidateAbandonedCartSettings,
  saveAbandonedCartSettings,
} from "@/lib/data/abandoned-carts";
import { useMoneyLabel } from "@/hooks/use-store-currency";

interface AbandonedCartSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  initialSettings?: BrandAbandonedCartSettings | null;
}

type CartSettingsForm = Pick<
  BrandAbandonedCartSettings,
  | "is_enabled"
  | "abandonment_threshold_minutes"
  | "default_discount_type"
  | "default_discount_value"
  | "discount_expiry_hours"
>;

/**
 * What the store decides about left carts: whether they are marked as left, after how long, and
 * the code a person may add to a reminder (none until the store chooses one). Nothing is sent
 * automatically, so there are no channels, steps or limits to set.
 */
const formOf = (settings?: BrandAbandonedCartSettings | null): CartSettingsForm => ({
  is_enabled: settings?.is_enabled ?? true,
  abandonment_threshold_minutes: settings?.abandonment_threshold_minutes ?? 30,
  default_discount_type: settings ? settings.default_discount_type : "none",
  default_discount_value: settings?.default_discount_value ?? 0,
  discount_expiry_hours: settings?.discount_expiry_hours ?? 48,
});

export function AbandonedCartSettingsDialog({
  open,
  onOpenChange,
  brandId,
  initialSettings,
}: AbandonedCartSettingsDialogProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const money = useMoneyLabel(isAr ? "ar" : "en");
  const queryClient = useQueryClient();

  const [form, setForm] = useState<CartSettingsForm>(() => formOf(initialSettings));

  useEffect(() => {
    setForm(formOf(initialSettings));
  }, [initialSettings]);

  const saveMutation = useMutation({
    mutationFn: (updated: CartSettingsForm) => saveAbandonedCartSettings(brandId, updated),
    onSuccess: () => {
      toast.success(isAr ? "تم حفظ الإعدادات" : "Settings saved");
      invalidateAbandonedCartSettings(queryClient, brandId);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || (isAr ? "حدث خطأ أثناء الحفظ" : "Failed to save settings"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const offersCode = form.default_discount_type !== "none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <ShoppingCart className="h-5 w-5 text-primary" />
            {isAr ? "إعدادات السلات المتروكة" : "Abandoned cart settings"}
          </DialogTitle>
          <DialogDescription>
            {isAr
              ? "لا يُرسل النظام أي رسالة بنفسه: ترسل أنت التذكير عبر واتساب لمن وافق على ذلك."
              : "Nothing is sent automatically: you send a reminder on WhatsApp to shoppers who agreed to hear from you."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
            <div className="space-y-0.5">
              <Label htmlFor="cart-tracking" className="text-base font-semibold">
                {isAr ? "متابعة السلات المتروكة" : "Follow up left carts"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "عند الإيقاف لا تُعد السلة متروكة ولا تظهر في «عملاء للتواصل اليوم»."
                  : "When off, carts are not marked as left and do not appear in Clients to message."}
              </p>
            </div>
            <Switch
              id="cart-tracking"
              checked={form.is_enabled}
              onCheckedChange={(c) => setForm((prev) => ({ ...prev, is_enabled: c }))}
            />
          </div>

          <Card className="p-4 space-y-3 border-border">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Clock className="h-4 w-4 text-primary" />
              {isAr ? "متى تُعد السلة متروكة" : "When a cart counts as left"}
            </h3>
            <div className="space-y-1.5 sm:max-w-xs">
              <Label htmlFor="threshold">
                {isAr ? "بعد دون نشاط (دقيقة)" : "After no activity for (minutes)"}
              </Label>
              <Input
                id="threshold"
                type="number"
                min="5"
                value={form.abandonment_threshold_minutes}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    abandonment_threshold_minutes: Math.max(5, Number(e.target.value) || 5),
                  }))
                }
              />
            </div>
          </Card>

          <Card className="p-4 space-y-4 border-border">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                {isAr ? "كود خصم مع التذكير (اختياري)" : "A code with the reminder (optional)"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "يُنشأ كود لسلة واحدة فقط عندما تختار «واتساب مع كود» عليها."
                  : "A one-use code is made for a cart only when you choose “WhatsApp with a code” on it."}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="disc_type">{isAr ? "الخصم" : "Discount"}</Label>
                <Select
                  value={form.default_discount_type}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      default_discount_type: v as CartSettingsForm["default_discount_type"],
                    }))
                  }
                >
                  <SelectTrigger
                    id="disc_type"
                    className="min-h-[44px] bg-background border-border"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isAr ? "بدون كود" : "No code"}</SelectItem>
                    <SelectItem value="percentage">
                      {isAr ? "نسبة مئوية (%)" : "Percentage (%)"}
                    </SelectItem>
                    <SelectItem value="fixed">
                      {isAr ? `مبلغ ثابت (${money})` : `Fixed amount (${money})`}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {offersCode && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="disc_val">{isAr ? "قيمة الخصم" : "Discount value"}</Label>
                    <Input
                      id="disc_val"
                      type="number"
                      min="0"
                      step="0.5"
                      value={form.default_discount_value}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          default_discount_value: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="exp_hrs">
                      {isAr ? "صلاحية الكود (ساعة)" : "Code valid for (hours)"}
                    </Label>
                    <Input
                      id="exp_hrs"
                      type="number"
                      min="1"
                      value={form.discount_expiry_hours}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          discount_expiry_hours: Number(e.target.value) || 24,
                        }))
                      }
                    />
                  </div>
                </>
              )}
            </div>
          </Card>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="min-h-[44px]"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="min-h-[44px] bg-primary text-primary-foreground"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isAr ? (
                "حفظ الإعدادات"
              ) : (
                "Save settings"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
