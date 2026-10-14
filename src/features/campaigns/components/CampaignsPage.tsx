import { toast } from "sonner";

import { CampaignsCommandHeader } from "@/components/campaigns/CampaignsCommandHeader";
import { CampaignsScopeSwitcher } from "@/components/campaigns/CampaignsScopeSwitcher";
import type { CampaignSegment } from "@/features/campaigns/lib/campaign-shared";
import { CampaignMessageCard } from "@/features/campaigns/components/CampaignMessageCard";
import { CampaignAudienceCard } from "@/features/campaigns/components/CampaignAudienceCard";
import { SaveTemplateDialog } from "@/features/campaigns/components/SaveTemplateDialog";
import { BulkCampaignDialog } from "@/features/campaigns/components/BulkCampaignDialog";
import { useCampaignsPage } from "@/features/campaigns/hooks/use-campaigns-page";

/** WhatsApp campaigns: write a message, choose who gets it, send it one chat at a time. */
export function CampaignsPage({ segment }: { segment: CampaignSegment }) {
  const page = useCampaignsPage(segment);
  const {
    isAr,
    selectedSegment,
    setSelectedSegment,
    selectedCustomerIds,
    setBulkOpen,
    setBulkIndex,
    setBulkQueue,
    setBulkSent,
    customersQ,
    openSave,
    segmentCounts,
    templates,
  } = page;
  return (
    <div className="space-y-3.5">
      {/* 1. Command Header */}
      <CampaignsCommandHeader
        lang={isAr ? "ar" : "en"}
        templateCount={templates.length}
        selectedCount={selectedCustomerIds.length}
        onNewTemplate={() => openSave("new")}
        onStartBulk={() => {
          if (selectedCustomerIds.length === 0) {
            toast.error(isAr ? "اختر عميلًا واحدًا على الأقل" : "Select at least one customer");
            return;
          }
          const queue = (customersQ.data ?? []).filter((c) => selectedCustomerIds.includes(c.id));
          setBulkQueue(queue);
          setBulkIndex(0);
          setBulkSent({});
          setBulkOpen(true);
        }}
      />

      {/* 2. Scope Switcher */}
      <CampaignsScopeSwitcher
        lang={isAr ? "ar" : "en"}
        activeSegment={selectedSegment}
        onSegmentChange={(seg) => setSelectedSegment(seg)}
        counts={segmentCounts}
      />

      <CampaignMessageCard page={page} />

      <CampaignAudienceCard page={page} />

      <SaveTemplateDialog page={page} />

      <BulkCampaignDialog page={page} />
    </div>
  );
}
