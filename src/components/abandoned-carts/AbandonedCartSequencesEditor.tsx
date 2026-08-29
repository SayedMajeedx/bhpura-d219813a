import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Send,
  MessageSquare,
  Mail,
  Bell,
  Clock,
  Sparkles,
  Edit2,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { AbandonedCartSequence, RecoveryChannel } from "@/lib/abandoned-carts.types";
import { DEFAULT_ABANDONED_SEQUENCES } from "@/lib/abandoned-carts.types";

interface AbandonedCartSequencesEditorProps {
  brandId: string;
  sequences: AbandonedCartSequence[];
}

export function AbandonedCartSequencesEditor({
  brandId,
  sequences,
}: AbandonedCartSequencesEditorProps) {
  const { lang, t } = useI18n();
  const isAr = lang === "ar";
  const queryClient = useQueryClient();

  const [editingSequence, setEditingSequence] = useState<AbandonedCartSequence | null>(null);

  // Initialize missing sequences if empty
  const initSequencesMutation = useMutation({
    mutationFn: async () => {
      const inserts = DEFAULT_ABANDONED_SEQUENCES.map((seq) => ({
        brand_id: brandId,
        ...seq,
      }));
      const { error } = await (supabase as any)
        .from("abandoned_cart_sequences")
        .upsert(inserts, { onConflict: "brand_id,step_number" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        isAr ? "تم تهيئة خطوات الاستعادة الافتراضية بنجاح" : "Default sequences initialized",
      );
      queryClient.invalidateQueries({ queryKey: ["abandoned_cart_sequences", brandId] });
    },
    onError: (err: any) => {
      toast.error(err.message || (isAr ? "فشل تهيئة الخطوات" : "Failed to initialize sequences"));
    },
  });

  const saveSequenceMutation = useMutation({
    mutationFn: async (seq: AbandonedCartSequence) => {
      const { error } = await (supabase as any)
        .from("abandoned_cart_sequences")
        .upsert(
          {
            ...seq,
            brand_id: brandId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "brand_id,step_number" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        isAr ? "تم حفظ خطوة الاستعادة بنجاح" : "Recovery sequence updated successfully",
      );
      queryClient.invalidateQueries({ queryKey: ["abandoned_cart_sequences", brandId] });
      setEditingSequence(null);
    },
    onError: (err: any) => {
      toast.error(err.message || (isAr ? "حدث خطأ أثناء الحفظ" : "Failed to save sequence"));
    },
  });

  const displaySequences = sequences.length > 0 ? sequences : (DEFAULT_ABANDONED_SEQUENCES as any[]);

  const getChannelIcon = (ch: RecoveryChannel) => {
    switch (ch) {
      case "whatsapp":
        return <MessageSquare className="h-4 w-4 text-emerald-500" />;
      case "email":
        return <Mail className="h-4 w-4 text-sky-500" />;
      case "push":
        return <Bell className="h-4 w-4 text-purple-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold font-display text-foreground flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            {isAr ? "مسار رسائل الاستعادة التلقائية (Drip Flow)" : "Automated Recovery Flow"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? "تسلسل رسائل تذكير ذكية مع فترات زمنية وأكواد خصم تحفيزية متصاعدة."
              : "Progressive multi-step sequence with timing delays and dynamic coupon triggers."}
          </p>
        </div>

        {sequences.length === 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => initSequencesMutation.mutate()}
            disabled={initSequencesMutation.isPending}
            className="min-h-[44px] gap-2 border-border"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            {isAr ? "تهيئة المسار الافتراضي" : "Initialize Default Flow"}
          </Button>
        )}
      </div>

      {/* Sequence Steps Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {displaySequences.map((seq: AbandonedCartSequence) => (
          <Card
            key={seq.step_number}
            className="p-5 border-border bg-card flex flex-col justify-between relative overflow-hidden transition-all hover:border-primary/50 shadow-xs"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                    {seq.step_number}
                  </span>
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    {getChannelIcon(seq.channel)}
                    <span className="capitalize">{seq.channel}</span>
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditingSequence(seq)}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1.5 rounded-lg">
                <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>
                  {isAr
                    ? `إرسال بعد ${seq.delay_hours} ساعة من ترك السلة`
                    : `Sends ${seq.delay_hours} hour(s) after abandonment`}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  {isAr ? "عنوان الرسالة" : "Subject"}
                </span>
                <p className="text-xs font-medium text-foreground line-clamp-1">
                  {isAr ? seq.subject_ar : seq.subject_en}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  {isAr ? "معاينة القالب" : "Message Preview"}
                </span>
                <p className="text-xs text-muted-foreground line-clamp-3 bg-background p-2 rounded border border-border/50 font-mono text-[11px]">
                  {isAr ? seq.message_template_ar : seq.message_template_en}
                </p>
              </div>

              {seq.include_discount && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {isAr
                      ? `يتضمن كود خصم تلقائي بقيمة ${seq.discount_percent}%`
                      : `Includes auto-generated ${seq.discount_percent}% coupon`}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingSequence(seq)}
                className="w-full min-h-[44px] text-xs border-border"
              >
                {isAr ? "تعديل القالب والتوقيت" : "Edit Sequence Step"}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Sequence Edit Dialog */}
      {editingSequence && (
        <Dialog
          open={!!editingSequence}
          onOpenChange={(open) => !open && setEditingSequence(null)}
        >
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display">
                <Send className="h-5 w-5 text-primary" />
                {isAr
                  ? `تعديل خطوة الاستعادة #${editingSequence.step_number}`
                  : `Edit Recovery Step #${editingSequence.step_number}`}
              </DialogTitle>
              <DialogDescription>
                {isAr
                  ? "تخصيص القناة، تأخير الإرسال، نصوص الرسائل، ومتغيرات الاستبدال."
                  : "Configure dispatch channel, delay hours, templates, and replacement tags."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{isAr ? "قناة الإرسال" : "Channel"}</Label>
                  <Select
                    value={editingSequence.channel}
                    onValueChange={(val: any) =>
                      setEditingSequence({ ...editingSequence, channel: val })
                    }
                  >
                    <SelectTrigger className="min-h-[44px] bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp (واتساب)</SelectItem>
                      <SelectItem value="email">Email (بريد إلكتروني)</SelectItem>
                      <SelectItem value="push">Push Notification</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>{isAr ? "التأخير بالساعات" : "Delay (Hours)"}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editingSequence.delay_hours}
                    onChange={(e) =>
                      setEditingSequence({
                        ...editingSequence,
                        delay_hours: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{isAr ? "عنوان الرسالة (عربي)" : "Subject (Arabic)"}</Label>
                <Input
                  value={editingSequence.subject_ar}
                  onChange={(e) =>
                    setEditingSequence({ ...editingSequence, subject_ar: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>{isAr ? "عنوان الرسالة (إنجليزي)" : "Subject (English)"}</Label>
                <Input
                  value={editingSequence.subject_en}
                  onChange={(e) =>
                    setEditingSequence({ ...editingSequence, subject_en: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>{isAr ? "قالب الرسالة (عربي)" : "Message Template (Arabic)"}</Label>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {"{name}, {brand_name}, {recovery_link}, {discount_code}"}
                  </span>
                </div>
                <Textarea
                  rows={3}
                  value={editingSequence.message_template_ar}
                  onChange={(e) =>
                    setEditingSequence({
                      ...editingSequence,
                      message_template_ar: e.target.value,
                    })
                  }
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>{isAr ? "قالب الرسالة (إنجليزي)" : "Message Template (English)"}</Label>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {"{name}, {brand_name}, {recovery_link}, {discount_code}"}
                  </span>
                </div>
                <Textarea
                  rows={3}
                  value={editingSequence.message_template_en}
                  onChange={(e) =>
                    setEditingSequence({
                      ...editingSequence,
                      message_template_en: e.target.value,
                    })
                  }
                  className="font-mono text-xs"
                />
              </div>

              <div className="p-3 rounded-xl border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <Label>{isAr ? "تضمين كود خصم تحفيزي" : "Include Discount Incentive"}</Label>
                  <Switch
                    checked={editingSequence.include_discount}
                    onCheckedChange={(c) =>
                      setEditingSequence({ ...editingSequence, include_discount: c })
                    }
                  />
                </div>

                {editingSequence.include_discount && (
                  <div className="space-y-1.5">
                    <Label>{isAr ? "نسبة الخصم (%)" : "Discount Percentage (%)"}</Label>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      value={editingSequence.discount_percent}
                      onChange={(e) =>
                        setEditingSequence({
                          ...editingSequence,
                          discount_percent: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setEditingSequence(null)}
                className="min-h-[44px]"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                onClick={() => saveSequenceMutation.mutate(editingSequence)}
                disabled={saveSequenceMutation.isPending}
                className="min-h-[44px] bg-primary text-primary-foreground"
              >
                {saveSequenceMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isAr ? (
                  "حفظ الخطوة"
                ) : (
                  "Save Step"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
