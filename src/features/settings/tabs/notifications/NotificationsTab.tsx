import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Mail, MessageSquareText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupNavigator, type GroupDef } from "@/features/settings/GroupNavigator";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { useI18n } from "@/lib/i18n";
import { RecipientsGroup } from "./RecipientsGroup";
import { TemplatesGroup } from "./TemplatesGroup";

const GROUPS: GroupDef[] = [
  { id: "templates", icon: MessageSquareText, render: () => <TemplatesGroup /> },
  { id: "recipients", icon: Users, render: () => <RecipientsGroup /> },
];

/**
 * The one place a store sets its notifications: what each message says and who gets its alerts.
 * What went out is the Sent messages page, linked from here (it once had its own "Notifications"
 * with the recipients a second time).
 */
export function NotificationsTab() {
  return <GroupNavigator tab="notifications" groups={GROUPS} before={<SentMessagesLine />} />;
}

function SentMessagesLine() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const navigate = useNavigate();
  const { form } = useBrandSettingsFormContext();
  const slug = form.brand?.slug;
  if (!slug) return null;
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-muted/30 px-3.5 py-2.5">
      <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 break-words">
          {isAr
            ? "هنا ما تقوله الرسائل ومن تصله التنبيهات. ما أُرسل فعلاً في صفحة الرسائل المرسلة."
            : "Here is what messages say and who gets alerts. What actually went out is on the Sent messages page."}
        </span>
      </span>
      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={() =>
          void navigate({ href: `/admin/b/${encodeURIComponent(slug)}/communications` })
        }
        className="h-auto gap-1 p-0 text-xs font-semibold"
      >
        {isAr ? "الرسائل المرسلة" : "Sent messages"}
        <ArrowRight className="h-3 w-3 rtl:rotate-180" aria-hidden />
      </Button>
    </div>
  );
}
