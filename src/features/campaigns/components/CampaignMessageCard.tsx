import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, Trash2, Plus } from "lucide-react";

import type { CampaignsPageState } from "@/features/campaigns/hooks/use-campaigns-page";

/** The message: saved templates, the text and its placeholders. */
export function CampaignMessageCard({ page }: { page: CampaignsPageState }) {
  const {
    isAr,
    message,
    setMessage,
    selectedId,
    textareaRef,
    onSelectTemplate,
    openSave,
    deleteTemplate,
    insertPlaceholder,
    filtered,
    buildMessage,
    templates,
    placeholders,
  } = page;
  return (
    <>
      <Card className="mb-3 space-y-4 overflow-hidden rounded-2xl border border-border-subtle bg-card p-3 shadow-lg sm:mb-6 sm:p-6">
        {/* Template picker + actions */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 min-w-0">
            <Label className="text-sm font-medium">
              {isAr ? "اختر قالب الرسالة" : "Select Template"}
            </Label>
            <Select value={selectedId || undefined} onValueChange={onSelectTemplate}>
              <SelectTrigger className="mt-1 text-start">
                <SelectValue
                  placeholder={
                    templates.length === 0
                      ? isAr
                        ? "لا توجد قوالب محفوظة بعد"
                        : "No saved templates yet"
                      : isAr
                        ? "اختر قالبًا..."
                        : "Choose a template..."
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <Button
              variant="outline"
              onClick={() => openSave("new")}
              className="min-w-0 px-2 shadow-sm transition-all duration-200 hover:scale-[1.01] hover:shadow active:scale-95 sm:px-4"
            >
              <Plus className="h-4 w-4 me-2" />
              {isAr ? "قالب جديد" : "New"}
            </Button>
            <Button
              variant="outline"
              onClick={() => openSave("update")}
              disabled={!selectedId}
              className="min-w-0 px-2 shadow-sm transition-all duration-200 hover:scale-[1.01] hover:shadow active:scale-95 sm:px-4"
            >
              <Save className="h-4 w-4 me-2" />
              {isAr ? "حفظ القالب" : "Save Template"}
            </Button>
            <Button
              variant="ghost"
              onClick={deleteTemplate}
              disabled={!selectedId}
              className="min-w-0 px-2 shadow-sm transition-all duration-200 hover:scale-[1.01] hover:shadow active:scale-95 sm:px-4"
            >
              <Trash2 className="h-4 w-4 me-2 text-destructive" />
              {isAr ? "حذف" : "Delete"}
            </Button>
          </div>
        </div>

        {/* Message body */}
        <div>
          <Label className="text-sm font-medium">{isAr ? "نص الرسالة" : "Broadcast message"}</Label>
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="text-start mt-1 bg-background/50 focus:bg-background transition-all duration-200"
            dir={isAr ? "rtl" : "ltr"}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {isAr ? "إدراج حقل تلقائي:" : "Insert placeholder:"}
            </span>
            {placeholders.map((p) => (
              <button
                key={p.token}
                type="button"
                onClick={() => insertPlaceholder(p.token)}
                className="text-xs px-2.5 py-1 rounded-full bg-secondary/80 text-foreground hover:bg-primary hover:text-primary-foreground hover:scale-105 active:scale-95 transition-all duration-200"
              >
                {p.label} <code className="opacity-70 font-mono text-xs">{p.token}</code>
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-muted-foreground border-t border-border-subtle pt-3">
          <span className="font-medium">{isAr ? "معاينة:" : "Preview:"}</span>{" "}
          <span className="text-foreground italic bg-secondary/20 px-2 py-1 rounded">
            {buildMessage(filtered[0]?.name ?? (isAr ? "العميل" : "Customer"))}
          </span>
        </div>
      </Card>
    </>
  );
}
