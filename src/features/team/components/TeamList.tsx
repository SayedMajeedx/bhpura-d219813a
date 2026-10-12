import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OsEmptyState } from "@/components/os/os-empty-state";
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  Shield,
  UserX,
  Check,
  X,
  Crown,
  KeyRound,
  MessageCircle,
} from "lucide-react";
import { SUPER_ADMIN_EMAIL } from "@/lib/profile-context";

import { AVAILABLE_PERMISSIONS } from "@/features/team/lib/team-shared";
import type { TeamPageState } from "@/features/team/hooks/use-team-page";

/** The staff, or the empty state: a card per member with what they may do and the actions on them. */
export function TeamList({ page }: { page: TeamPageState }) {
  const {
    isAr,
    currentUser,
    isSuperAdmin,
    setAddOpen,
    setDeleteConfirm,
    handleQuickResetTempPassword,
    handleUpdate,
    openEdit,
    staff,
    filteredStaff,
    locale,
  } = page;
  return (
    <>
      {staff.length === 0 ? (
        <OsEmptyState
          icon={Users}
          title={isAr ? "فريق العمل" : "Team Members"}
          description={
            isAr
              ? "قم بدعوة أعضاء فريقك للتعاون في إدارة الطلبات والمخزون والإعدادات بصلاحيات مخصصة."
              : "Invite your team members to collaborate on managing orders, inventory, and settings with customized permissions."
          }
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 me-2" />
              {isAr ? "دعوة عضو جديد" : "Invite Team Member"}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Mobile Card View */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredStaff.map((member) => (
              <Card
                key={member.id}
                className="p-4 border-border-subtle shadow-sm rounded-xl bg-card flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-base line-clamp-2 break-words">
                      {member.name || member.email.split("@")[0]}
                    </span>
                    <span className="text-xs text-muted-foreground truncate" dir="ltr">
                      {member.email}
                    </span>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
                    {member.must_change_password && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium border border-amber-500/25">
                        <KeyRound className="h-3 w-3" />
                        {isAr ? "في انتظار أول دخول" : "Pending First Login"}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        member.status === "active"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {member.status === "active" ? (
                        <>
                          <Check className="h-3 w-3" />
                          {isAr ? "نشط" : "Active"}
                        </>
                      ) : (
                        <>
                          <X className="h-3 w-3" />
                          {isAr ? "غير نشط" : "Inactive"}
                        </>
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md font-semibold ${
                      member.role === "super_admin"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : member.role === "brand_admin"
                          ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                          : member.role === "admin"
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {member.role === "super_admin" ? (
                      <>
                        <Crown className="h-3 w-3" />
                        {isAr ? "مدير عام" : "Super Admin"}
                      </>
                    ) : member.role === "brand_admin" ? (
                      <>
                        <Shield className="h-3 w-3" />
                        {isAr ? "مدير علامة تجارية" : "Brand Admin"}
                      </>
                    ) : member.role === "admin" ? (
                      <>
                        <Shield className="h-3 w-3" />
                        {isAr ? "مدير" : "Admin"}
                      </>
                    ) : member.role === "courier" ? (
                      <>
                        <Users className="h-3 w-3" />
                        {isAr ? "مندوب توصيل" : "Courier"}
                      </>
                    ) : (
                      <>
                        <Users className="h-3 w-3" />
                        {isAr ? "موظف" : "Staff"}
                      </>
                    )}
                  </span>

                  {member.phone && (
                    <a
                      href={`https://wa.me/${member.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-md hover:bg-emerald-500/20 transition-colors"
                      dir="ltr"
                      title={isAr ? "محادثة واتساب مباشرة" : "Direct WhatsApp Chat"}
                    >
                      <MessageCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{member.phone}</span>
                    </a>
                  )}
                </div>

                {member.role === "staff" && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Array.isArray((member as any).permissions) &&
                    (member as any).permissions.length > 0 ? (
                      (member as any).permissions.map((pId: string) => {
                        const permObj = AVAILABLE_PERMISSIONS.find((p) => p.id === pId);
                        return (
                          <span
                            key={pId}
                            className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium"
                          >
                            {isAr ? permObj?.labelAr || pId : permObj?.labelEn || pId}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        {isAr ? "بدون صلاحيات مخصصة" : "No specific permissions"}
                      </span>
                    )}
                  </div>
                )}

                <div className="pt-3 mt-1 border-t border-border-subtle flex justify-between items-center">
                  <span className="text-xs text-muted-foreground font-medium">
                    {new Date(member.created_at).toLocaleDateString(locale)}
                  </span>

                  <div className="flex items-center gap-1">
                    {(() => {
                      const isSelf = member.id === currentUser?.id;
                      const targetIsSuper =
                        member.role === "super_admin" ||
                        member.email.toLowerCase() === SUPER_ADMIN_EMAIL;
                      const canManage = !isSelf && (!targetIsSuper || isSuperAdmin);
                      if (!canManage) {
                        return (
                          <span className="text-xs text-muted-foreground font-semibold px-2">
                            {isSelf ? (isAr ? "أنت" : "You") : isAr ? "محمي" : "Protected"}
                          </span>
                        );
                      }
                      return (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 border-amber-500/20"
                            title={
                              isAr
                                ? "إعادة تعيين كلمة مرور مؤقتة فورية"
                                : "Quick Reset Temporary Password"
                            }
                            onClick={() => handleQuickResetTempPassword(member)}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openEdit(member)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {member.status === "active" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                              title={isAr ? "إلغاء تفعيل الحساب" : "Deactivate account"}
                              onClick={() => handleUpdate(member.id, { status: "inactive" })}
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          )}
                          {member.status === "inactive" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                              title={isAr ? "إعادة تفعيل الحساب" : "Reactivate account"}
                              onClick={() => handleUpdate(member.id, { status: "active" })}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                            onClick={() => setDeleteConfirm(member)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop Table View */}
          <Card className="hidden md:block overflow-hidden border-border-subtle shadow-lg rounded-2xl bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm lg:min-w-[640px]">
                <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                  <tr>
                    <th className="p-4 text-start">{isAr ? "الاسم" : "Name"}</th>
                    <th className="hidden p-4 text-start md:table-cell">
                      {isAr ? "البريد الإلكتروني" : "Email"}
                    </th>
                    <th className="hidden p-4 text-start sm:table-cell">
                      {isAr ? "الهاتف / الواتساب" : "Phone / WhatsApp"}
                    </th>
                    <th className="p-4 text-start">{isAr ? "الدور" : "Role"}</th>
                    <th className="hidden p-4 text-start sm:table-cell">
                      {isAr ? "الحالة" : "Status"}
                    </th>
                    <th className="hidden p-4 text-start lg:table-cell">
                      {isAr ? "تاريخ الإنشاء" : "Created"}
                    </th>
                    <th className="p-4 text-end">{isAr ? "إجراءات" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((member) => (
                    <tr key={member.id} className="border-t border-border">
                      <td className="p-4 font-medium">
                        {member.name || member.email.split("@")[0]}
                      </td>
                      <td className="hidden p-4 text-muted-foreground md:table-cell" dir="ltr">
                        {member.email}
                      </td>
                      <td className="hidden p-4 text-muted-foreground sm:table-cell" dir="ltr">
                        {member.phone ? (
                          <a
                            href={`https://wa.me/${member.phone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md hover:bg-emerald-500/20 transition-colors"
                            title={isAr ? "محادثة واتساب مباشرة" : "Direct WhatsApp Chat"}
                          >
                            <MessageCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                            <span>{member.phone}</span>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            {isAr ? "غير محدد" : "None"}
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col items-start gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                              member.role === "super_admin"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                : member.role === "brand_admin"
                                  ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                                  : member.role === "admin"
                                    ? "bg-primary/10 text-primary"
                                    : "bg-secondary text-secondary-foreground"
                            }`}
                          >
                            {member.role === "super_admin" ? (
                              <>
                                <Crown className="h-3 w-3" />
                                {isAr ? "مدير عام" : "Super Admin"}
                              </>
                            ) : member.role === "brand_admin" ? (
                              <>
                                <Shield className="h-3 w-3" />
                                {isAr ? "مدير علامة تجارية" : "Brand Admin"}
                              </>
                            ) : member.role === "admin" ? (
                              <>
                                <Shield className="h-3 w-3" />
                                {isAr ? "مدير" : "Admin"}
                              </>
                            ) : member.role === "courier" ? (
                              <>
                                <Users className="h-3 w-3" />
                                {isAr ? "مندوب توصيل" : "Courier"}
                              </>
                            ) : (
                              <>
                                <Users className="h-3 w-3" />
                                {isAr ? "موظف" : "Staff"}
                              </>
                            )}
                          </span>

                          {member.role === "staff" && (
                            <div className="flex flex-wrap gap-1 max-w-[260px]">
                              {Array.isArray((member as any).permissions) &&
                              (member as any).permissions.length > 0 ? (
                                (member as any).permissions.map((pId: string) => {
                                  const permObj = AVAILABLE_PERMISSIONS.find((p) => p.id === pId);
                                  return (
                                    <span
                                      key={pId}
                                      className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium"
                                    >
                                      {isAr ? permObj?.labelAr || pId : permObj?.labelEn || pId}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-xs text-muted-foreground italic">
                                  {isAr ? "بدون صلاحيات مخصصة" : "No specific permissions"}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                              member.status === "active"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground border border-border"
                            }`}
                          >
                            {member.status === "active" ? (
                              <>
                                <Check className="h-3 w-3" />
                                {isAr ? "نشط" : "Active"}
                              </>
                            ) : (
                              <>
                                <X className="h-3 w-3" />
                                {isAr ? "غير نشط" : "Inactive"}
                              </>
                            )}
                          </span>
                          {member.must_change_password && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium border border-amber-500/20 whitespace-nowrap">
                              <KeyRound className="h-2.5 w-2.5" />
                              {isAr ? "في انتظار أول دخول" : "Pending First Login"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="hidden p-4 text-muted-foreground lg:table-cell">
                        {new Date(member.created_at).toLocaleDateString(locale)}
                      </td>
                      <td className="p-4 text-end">
                        <div className="flex items-center justify-end gap-1">
                          {(() => {
                            const isSelf = member.id === currentUser?.id;
                            const targetIsSuper =
                              member.role === "super_admin" ||
                              member.email.toLowerCase() === SUPER_ADMIN_EMAIL;
                            const canManage = !isSelf && (!targetIsSuper || isSuperAdmin);
                            if (!canManage) {
                              return (
                                <span className="text-xs text-muted-foreground">
                                  {isSelf ? (isAr ? "أنت" : "You") : isAr ? "محمي" : "Protected"}
                                </span>
                              );
                            }
                            return (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                                  title={
                                    isAr
                                      ? "إعادة تعيين كلمة مرور مؤقتة فورية"
                                      : "Quick Reset Temporary Password"
                                  }
                                  onClick={() => handleQuickResetTempPassword(member)}
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEdit(member)}
                                  aria-label={isAr ? "تعديل" : "Edit"}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {member.status === "active" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    title={isAr ? "إلغاء تفعيل الحساب" : "Deactivate account"}
                                    onClick={() => handleUpdate(member.id, { status: "inactive" })}
                                  >
                                    <UserX className="h-4 w-4" />
                                  </Button>
                                )}
                                {member.status === "inactive" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                    title={isAr ? "إعادة تفعيل الحساب" : "Reactivate account"}
                                    onClick={() => handleUpdate(member.id, { status: "active" })}
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteConfirm(member)}
                                  aria-label={isAr ? "حذف" : "Delete"}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
