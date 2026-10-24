import { Megaphone, Plus, Play } from "lucide-react";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { countOf } from "@/lib/arabic-count";

interface CampaignsCommandHeaderProps {
  lang: "ar" | "en";
  templateCount: number;
  selectedCount: number;
  onNewTemplate: () => void;
  onStartBulk: () => void;
}

export function CampaignsCommandHeader({
  lang,
  templateCount,
  selectedCount,
  onNewTemplate,
  onStartBulk,
}: CampaignsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <AdminPageHeader
      icon={Megaphone}
      title={isAr ? "مركز الحملات والرسائل الجماعية" : "Broadcasts & Campaign Studio"}
      badges={
        <AdminPageCount>{countOf(templateCount, "template", isAr ? "ar" : "en")}</AdminPageCount>
      }
      description={
        isAr
          ? "إنشاء وإرسال حملات الواتساب الترويجية لشرائح العملاء، العملاء المميزين، والمعرضين للتسرب."
          : "Design, segment, and dispatch targeted WhatsApp promotional broadcasts to customer cohorts."
      }
      actions={
        <>
          <AdminPageAction
            icon={Plus}
            variant="outline"
            label={isAr ? "قالب جديد" : "New Template"}
            iconOnPhone
            onClick={onNewTemplate}
          />
          <AdminPageAction
            icon={Play}
            label={
              isAr ? `إطلاق حملة جماعية (${selectedCount})` : `Launch Campaign (${selectedCount})`
            }
            short={isAr ? `إطلاق (${selectedCount})` : `Launch (${selectedCount})`}
            onClick={onStartBulk}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          />
        </>
      }
    />
  );
}
