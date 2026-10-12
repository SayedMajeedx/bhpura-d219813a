import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Shield, Check, X, Crown, Sparkles, Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { UserRole, UserStatus } from "@/lib/profile-context";

import { AVAILABLE_PERMISSIONS, PERMISSION_PRESETS } from "@/features/team/lib/team-shared";
import type { TeamPageState } from "@/features/team/hooks/use-team-page";

/** Changes a member's details, role, permissions or password. */
export function EditStaffDialog({ page }: { page: TeamPageState }) {
  const {
    t,
    isAr,
    isSuperAdmin,
    editOpen,
    setEditOpen,
    editing,
    setEditing,
    editPassword,
    setEditPassword,
    editMustChangePassword,
    setEditMustChangePassword,
    showEditPassword,
    setShowEditPassword,
    handleGenerateEditPassword,
    handleUpdate,
  } = page;
  return (
    <>
      {/* Edit Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) {
            setEditing(null);
            setEditPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? "تعديل المستخدم" : "Edit User"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>{t("customers.name")}</Label>
                <Input
                  className="text-start"
                  value={editing.name || ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <Label>{isAr ? "رقم الهاتف / الواتساب" : "Phone / WhatsApp"}</Label>
                <Input
                  type="tel"
                  className="text-start"
                  value={editing.phone || ""}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  placeholder="e.g. +973 33000000"
                  dir="ltr"
                />
              </div>
              <div>
                <Label>{isAr ? "الدور" : "Role"}</Label>
                <Select
                  value={editing.role}
                  onValueChange={(v) => setEditing({ ...editing, role: v as UserRole })}
                >
                  <SelectTrigger className="text-start">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brand_admin">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        {isAr ? "مدير علامة تجارية" : "Brand Admin"}
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        {isAr ? "مدير" : "Admin"}
                      </div>
                    </SelectItem>
                    <SelectItem value="staff">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {isAr ? "موظف" : "Staff"}
                      </div>
                    </SelectItem>
                    <SelectItem value="courier">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {isAr ? "مندوب توصيل" : "Courier"}
                      </div>
                    </SelectItem>
                    {(isSuperAdmin || editing.role === "super_admin") && (
                      <SelectItem value="super_admin">
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4" />
                          {isAr ? "مدير عام" : "Super Admin"}
                        </div>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isAr ? "الحالة" : "Status"}</Label>
                <Select
                  value={editing.status}
                  onValueChange={(v) => setEditing({ ...editing, status: v as UserStatus })}
                >
                  <SelectTrigger className="text-start">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-600" />
                        {isAr ? "نشط" : "Active"}
                      </div>
                    </SelectItem>
                    <SelectItem value="inactive">
                      <div className="flex items-center gap-2">
                        <X className="h-4 w-4 text-amber-600" />
                        {isAr ? "غير نشط" : "Inactive"}
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editing.role === "staff" && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label>{isAr ? "الصلاحيات المخصصة" : "Staff Permissions"}</Label>
                    <span className="text-xs text-muted-foreground font-medium">
                      {isAr ? "نماذج سريعة:" : "Quick presets:"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pb-0.5">
                    {PERMISSION_PRESETS.map((preset) => {
                      const memberPerms = (editing as any).permissions || [];
                      const isSelected =
                        preset.permissions.length === memberPerms.length &&
                        preset.permissions.every((p) => memberPerms.includes(p));
                      return (
                        <Button
                          key={preset.id}
                          type="button"
                          size="sm"
                          variant={isSelected ? "default" : "outline"}
                          className="h-7 text-xs px-2.5 font-normal"
                          onClick={() =>
                            setEditing({
                              ...editing,
                              permissions: [...preset.permissions],
                            } as any)
                          }
                        >
                          {isAr ? preset.labelAr : preset.labelEn}
                        </Button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-border bg-secondary/5">
                    {AVAILABLE_PERMISSIONS.map((p) => {
                      const memberPerms = (editing as any).permissions || [];
                      const checked = memberPerms.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-2.5 text-sm cursor-pointer select-none hover:opacity-85 transition-opacity"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(val) => {
                              const newPerms = val
                                ? [...memberPerms, p.id]
                                : memberPerms.filter((x: string) => x !== p.id);
                              setEditing({ ...editing, permissions: newPerms } as any);
                            }}
                          />
                          <span className="text-xs font-medium">
                            {isAr ? p.labelAr : p.labelEn}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-staff-password">
                    {isAr
                      ? "تعيين أو إعادة تعيين كلمة المرور (اختياري)"
                      : "Set / Reset Password (optional)"}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerateEditPassword}
                    className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {isAr ? "توليد كلمة مرور" : "Generate Password"}
                  </Button>
                </div>

                <div className="relative">
                  <Input
                    id="edit-staff-password"
                    type={showEditPassword ? "text" : "password"}
                    className="text-start pe-10 font-mono"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder={isAr ? "أدخل كلمة مرور جديدة" : "Enter new password"}
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showEditPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {editPassword.trim() ? (
                  <div className="flex items-start gap-2 pt-1.5 p-2.5 rounded-lg bg-secondary/40 border border-border">
                    <Checkbox
                      id="edit-require-password-change"
                      checked={editMustChangePassword}
                      onCheckedChange={(checked) => setEditMustChangePassword(Boolean(checked))}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <label
                        htmlFor="edit-require-password-change"
                        className="text-xs font-semibold cursor-pointer text-foreground block"
                      >
                        {isAr
                          ? "إلزام بتغيير كلمة المرور عند تسجيل الدخول القادم"
                          : "Require password change on next sign-in"}
                      </label>
                      <p className="text-xs text-muted-foreground leading-tight">
                        {isAr
                          ? "سيتم تحويل الموظف تلقائياً لصفحة إعداد كلمة المرور الخاصة به فور تسجيل الدخول."
                          : "First sign-in password setup will be required upon next login."}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEditOpen(false);
                setEditing(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (editing) {
                  handleUpdate(editing.id, {
                    name: editing.name || undefined,
                    phone: editing.phone || null,
                    role: editing.role,
                    status: editing.status,
                    permissions: editing.role === "staff" ? (editing as any).permissions : [],
                    ...(editPassword.trim()
                      ? {
                          password: editPassword.trim(),
                          must_change_password: editMustChangePassword,
                        }
                      : {}),
                  });
                }
              }}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
