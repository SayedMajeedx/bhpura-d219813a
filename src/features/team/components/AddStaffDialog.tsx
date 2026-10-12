import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Users, Shield, Crown, Sparkles, Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { UserRole } from "@/lib/profile-context";

import { AVAILABLE_PERMISSIONS, PERMISSION_PRESETS } from "@/features/team/lib/team-shared";
import type { TeamPageState } from "@/features/team/hooks/use-team-page";

/** Adds a member of staff: who they are, their role and permissions, a first password. */
export function AddStaffDialog({ page }: { page: TeamPageState }) {
  const {
    t,
    isAr,
    isSuperAdmin,
    addOpen,
    setAddOpen,
    form,
    setForm,
    showPassword,
    setShowPassword,
    handleGeneratePassword,
    resetForm,
    handleAdd,
  } = page;
  return (
    <>
      <Dialog
        open={addOpen}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) resetForm();
        }}
      >
        <DialogTrigger asChild>
          <Button className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-2">
            <Plus className="h-4 w-4" />
            {isAr ? "إضافة موظف" : "Add Staff"}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? "إضافة موظف جديد" : "Add New Staff Member"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("customers.name")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Sayeed Majeed"
              />
            </div>
            <div>
              <Label>{t("customers.email")}</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="e.g. name@example.com"
                dir="ltr"
              />
            </div>
            <div>
              <Label>
                {isAr
                  ? "رقم الهاتف / الواتساب (مطلوب للمناديب)"
                  : "Phone / WhatsApp (required for couriers)"}
              </Label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="e.g. +973 33000000"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="staff-password">
                  {isAr
                    ? "كلمة المرور المؤقتة (للحسابات الجديدة)"
                    : "Temporary Password (new accounts)"}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleGeneratePassword}
                  className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isAr ? "توليد كلمة مرور" : "Generate Password"}
                </Button>
              </div>

              <div className="relative">
                <Input
                  id="staff-password"
                  type={showPassword ? "text" : "password"}
                  className="text-start pe-10 font-mono"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={isAr ? "مثال: Bq-x7#9kM" : "e.g. Bq-x7#9kM"}
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {form.password ? (
                <div className="flex items-start gap-2 pt-1.5 p-2.5 rounded-lg bg-secondary/40 border border-border">
                  <Checkbox
                    id="require-password-change"
                    checked={form.must_change_password}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, must_change_password: Boolean(checked) })
                    }
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <label
                      htmlFor="require-password-change"
                      className="text-xs font-semibold cursor-pointer text-foreground block"
                    >
                      {isAr
                        ? "إلزام بتغيير كلمة المرور فور أول تسجيل دخول (موصى به)"
                        : "Require password change on first sign-in (Recommended)"}
                    </label>
                    <p className="text-xs text-muted-foreground leading-tight">
                      {isAr
                        ? "سيتم تحويل الموظف تلقائياً لصفحة إعداد كلمة المرور الخاصة به فور تسجيل الدخول ولا يمكنه تصفح لوحة التحكم قبل إكمالها."
                        : "The user will be redirected to the password setup screen upon first login and blocked from dashboard access until updated."}
                    </p>
                  </div>
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "اتركها فارغة إذا كان البريد مرتبطاً بحساب عميل حالي؛ لن تتغير كلمة مروره."
                  : "Leave blank when the email belongs to an existing customer; their current password will not change."}
              </p>
            </div>
            <div>
              <Label>{isAr ? "الدور" : "Role"}</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as UserRole })}
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
                  {isSuperAdmin && (
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

            {form.role === "staff" && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label>{isAr ? "الصلاحيات المخصصة" : "Staff Permissions"}</Label>
                  <span className="text-xs text-muted-foreground font-medium">
                    {isAr ? "نماذج سريعة:" : "Quick presets:"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pb-0.5">
                  {PERMISSION_PRESETS.map((preset) => {
                    const isSelected =
                      preset.permissions.length === form.permissions.length &&
                      preset.permissions.every((p) => form.permissions.includes(p));
                    return (
                      <Button
                        key={preset.id}
                        type="button"
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        className="h-7 text-xs px-2.5 font-normal"
                        onClick={() => setForm({ ...form, permissions: [...preset.permissions] })}
                      >
                        {isAr ? preset.labelAr : preset.labelEn}
                      </Button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-border bg-secondary/5">
                  {AVAILABLE_PERMISSIONS.map((p) => {
                    const checked = form.permissions.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex items-center gap-2.5 text-sm cursor-pointer select-none hover:opacity-85 transition-opacity"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(val) => {
                            const newPerms = val
                              ? [...form.permissions, p.id]
                              : form.permissions.filter((x) => x !== p.id);
                            setForm({ ...form, permissions: newPerms });
                          }}
                        />
                        <span className="text-xs font-medium">{isAr ? p.labelAr : p.labelEn}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {isAr
                ? "سيحصل العضو الجديد على صلاحيات لوحة التحكم، وسيُطلب منه إنشاء كلمة مرور دائمة خاصة به عند تسجيل الدخول الأول."
                : "The new member will receive dashboard access and will be prompted to create their permanent password on first sign-in."}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setAddOpen(false);
                resetForm();
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleAdd}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
