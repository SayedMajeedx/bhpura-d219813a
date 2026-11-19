import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { CampaignsPageState } from "@/features/campaigns/hooks/use-campaigns-page";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";

/** Saves the message as a new template, or over the chosen one. */
export function SaveTemplateDialog({ page }: { page: CampaignsPageState }) {
  const { isAr, message, saveOpen, setSaveOpen, saveName, setSaveName, saveMode, saveTemplate } =
    page;
  return (
    <>
      {/* Save Template Modal */}
      <AppDialog open={saveOpen} onOpenChange={setSaveOpen} kind="form">
        <AppDialogHeader
          title={
            <>
              {saveMode === "update"
                ? isAr
                  ? "تحديث القالب"
                  : "Update template"
                : isAr
                  ? "حفظ قالب جديد"
                  : "Save new template"}
            </>
          }
        />

        <AppDialogBody>
          <div className="space-y-4">
            <div>
              <Label>{isAr ? "اسم القالب" : "Template name"}</Label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={isAr ? "مثال: عرض العيد" : "e.g. Eid promo"}
                className="text-start"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {isAr ? "المحتوى:" : "Body:"}
              <div className="mt-1 p-2 rounded bg-secondary text-foreground max-h-32 overflow-auto whitespace-pre-wrap">
                {message || "—"}
              </div>
            </div>
          </div>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={() => setSaveOpen(false)}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={saveTemplate}>{isAr ? "حفظ" : "Save"}</Button>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}
