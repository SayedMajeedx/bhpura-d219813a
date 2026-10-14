import { AlertTriangle } from "lucide-react";

import { TeamCommandHeader } from "@/components/team/TeamCommandHeader";
import { TeamScopeSwitcher } from "@/components/team/TeamScopeSwitcher";
import { AddStaffDialog } from "@/features/team/components/AddStaffDialog";
import { TeamList } from "@/features/team/components/TeamList";
import { EditStaffDialog } from "@/features/team/components/EditStaffDialog";
import { DeleteStaffDialog } from "@/features/team/components/DeleteStaffDialog";
import { StaffCredentialsDialog } from "@/features/team/components/StaffCredentialsDialog";
import { useTeamPage } from "@/features/team/hooks/use-team-page";

/** The store's team: who works here, what each may do, and their sign-in details. */
export function TeamManagement() {
  const page = useTeamPage();
  const {
    isAr,
    setAddOpen,
    statusScope,
    setStatusScope,
    staff,
    scopeCounts,
    isSingleAdmin,
    adminHasNoPhone,
  } = page;
  return (
    <div className="space-y-3.5">
      {/* 1. Command Header */}
      <TeamCommandHeader
        lang={isAr ? "ar" : "en"}
        memberCount={staff.length}
        onAddMember={() => setAddOpen(true)}
      />

      {/* 2. Scope Switcher */}
      <TeamScopeSwitcher
        lang={isAr ? "ar" : "en"}
        activeScope={statusScope}
        onScopeChange={(scope) => setStatusScope(scope)}
        counts={scopeCounts}
      />

      {isSingleAdmin && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
          <div className="space-y-1">
            <p className="font-bold text-sm">
              {isAr
                ? "تنبيه أمان واستمرارية: يوجد حساب مدير واحد فقط للمتجر"
                : "Security Notice: Single Store Administrator"}
            </p>
            <p className="opacity-90 leading-relaxed">
              {isAr
                ? adminHasNoPhone
                  ? "المتجر يدار حالياً بواسطة حساب إداري واحد وبدون رقم هاتف مسجل للطوارئ. يوصى بشدة بإضافة رقم هاتف ودعوة مدير احتياطي ثانٍ لتفادي فقدان الوصول للمتجر نهائياً."
                  : "المتجر يدار حالياً بواسطة حساب إداري واحد فقط. يوصى بدعوة حساب إداري احتياطي لتفادي مخاطر نقطة الفشل الفردية (SPOF)."
                : "The store is operated by a single admin account. Registering a backup admin and recovery phone is strongly recommended to eliminate Single Point of Failure (SPOF) risks."}
            </p>
          </div>
        </div>
      )}

      <AddStaffDialog page={page} />

      <TeamList page={page} />

      <EditStaffDialog page={page} />

      <DeleteStaffDialog page={page} />

      <StaffCredentialsDialog page={page} />
    </div>
  );
}
