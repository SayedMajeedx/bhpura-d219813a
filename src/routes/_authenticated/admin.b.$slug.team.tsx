import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { OsEmptyState } from "@/components/os/os-empty-state";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  AlertTriangle,
  KeyRound,
  Sparkles,
  Copy,
  CheckCheck,
  Eye,
  EyeOff,
  Share2,
  ShieldCheck,
  MessageCircle,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  generateSecureTempPassword,
  formatTeamInviteMessage,
} from "@/lib/team-credentials-utils";
import { toast } from "sonner";
import { useI18n, useT } from "@/lib/i18n";
import { useProfile, SUPER_ADMIN_EMAIL } from "@/lib/profile-context";
import { useBrand } from "@/lib/brand-context";
import type { Profile, UserRole, UserStatus } from "@/lib/profile-context";

import { TeamCommandHeader } from "@/components/team/TeamCommandHeader";
import { TeamScopeSwitcher, type TeamStatusScope } from "@/components/team/TeamScopeSwitcher";
import { queryKeys } from "@/lib/query-keys";
import { useEntitlements } from "@/lib/saas-billing/use-entitlements";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/team")({
  beforeLoad: async ({ context: { queryClient }, params }) => {
    const user = await queryClient.ensureQueryData({
      queryKey: ["auth_user"],
      queryFn: async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw redirect({ to: "/auth" });
        return data.user;
      },
      staleTime: 1000 * 60 * 5,
    });

    const profile = await queryClient.ensureQueryData({
      queryKey: ["auth_profile_role", user.id],
      queryFn: async () => {
        const { data } = await supabase
          .from("profiles")
          .select("role, status, email")
          .eq("id", user.id)
          .maybeSingle();
        return data ?? null;
      },
      staleTime: 1000 * 60 * 5,
    });

    const role = profile?.role;
    const allowed =
      !profile ||
      role === "admin" ||
      role === "super_admin" ||
      role === "brand_admin" ||
      (profile.email || "").toLowerCase() === SUPER_ADMIN_EMAIL;

    if (!allowed) {
      throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug: params.slug } });
    }
    if (profile && profile.status !== "active") {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
  },
  component: TeamManagement,
});

type StaffMember = Profile;

const USER_MANAGEMENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-management`;
const SUPABASE_PUBLIC_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

async function callUserManagement(action: string, body?: any) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("No session");

  const url = new URL(USER_MANAGEMENT_URL);
  url.searchParams.set("action", action);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(SUPABASE_PUBLIC_KEY ? { apikey: SUPABASE_PUBLIC_KEY } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseText = await response.text();
  let result: any = {};
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    result = { error: responseText || `Request failed (${response.status})` };
  }
  if (!response.ok) {
    throw new Error(result.error || `Request failed (${response.status})`);
  }
  return result;
}

const AVAILABLE_PERMISSIONS = [
  { id: "manage_inventory", labelEn: "Manage Inventory", labelAr: "إدارة المخزون" },
  { id: "manage_orders", labelEn: "Manage Orders", labelAr: "إدارة الطلبات" },
  { id: "manage_customers", labelEn: "Manage Customers", labelAr: "إدارة العملاء" },
  { id: "view_financials", labelEn: "View Financials", labelAr: "عرض البيانات المالية" },
  { id: "manage_settings", labelEn: "Manage Settings", labelAr: "إدارة الإعدادات" },
];

const PERMISSION_PRESETS = [
  {
    id: "all",
    labelEn: "Full Operational",
    labelAr: "كامل الصلاحيات",
    permissions: [
      "manage_inventory",
      "manage_orders",
      "manage_customers",
      "view_financials",
      "manage_settings",
    ],
  },
  {
    id: "sales_orders",
    labelEn: "Sales & Orders",
    labelAr: "مبيعات وطلبات",
    permissions: ["manage_orders", "manage_customers"],
  },
  {
    id: "inventory",
    labelEn: "Inventory & Stock",
    labelAr: "مخزون ومنتجات",
    permissions: ["manage_inventory", "manage_orders"],
  },
  {
    id: "finance",
    labelEn: "Finance & Accounts",
    labelAr: "محاسب مالي",
    permissions: ["view_financials", "manage_orders"],
  },
];

function TeamManagement() {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const { profile: currentUser, isSuperAdmin } = useProfile();
  const brand = useBrand();
  const { entitlements } = useEntitlements({ brandId: brand.id });

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<StaffMember | null>(null);

  const staffQ = useQuery({
    queryKey: queryKeys.staff.list(brand.id, isSuperAdmin),
    queryFn: async () => {
      const result = await callUserManagement("list");
      const list = (result.profiles || []) as StaffMember[];
      // Defense in depth: non-super-admins must never receive or render a
      // super-admin identity, even if a stale backend returns one.
      return list.filter(
        (m) =>
          (m.brand_id === brand.id || (isSuperAdmin && m.role === "super_admin")) &&
          (isSuperAdmin ||
            (m.role !== "super_admin" && m.email.toLowerCase() !== SUPER_ADMIN_EMAIL)),
      );
    },
  });

  const [form, setForm] = useState({
    email: "",
    name: "",
    phone: "",
    password: "",
    must_change_password: true,
    role: "staff" as UserRole,
    permissions: [] as string[],
  });
  const [showPassword, setShowPassword] = useState(false);

  const [editPassword, setEditPassword] = useState("");
  const [editMustChangePassword, setEditMustChangePassword] = useState(true);
  const [showEditPassword, setShowEditPassword] = useState(false);

  const [credentialsModal, setCredentialsModal] = useState<{
    isOpen: boolean;
    name: string;
    email: string;
    phone?: string;
    tempPassword?: string;
    mustChangePassword: boolean;
    storeName: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleQuickResetTempPassword = async (member: StaffMember) => {
    const newPassword = generateSecureTempPassword();
    try {
      await callUserManagement("update", {
        userId: member.id,
        password: newPassword,
        must_change_password: true,
      });
      toast.success(
        isAr
          ? "تم توليد كلمة مرور مؤقتة وتفعيل إجبار التغيير عند أول دخول"
          : "Temporary password generated with mandatory first-login change",
      );
      setCredentialsModal({
        isOpen: true,
        name: member.name || member.email.split("@")[0],
        email: member.email,
        phone: member.phone || undefined,
        tempPassword: newPassword,
        mustChangePassword: true,
        storeName: isAr ? brand.name_ar || brand.name_en : brand.name_en,
      });
      qc.invalidateQueries({ queryKey: queryKeys.staff.all(brand.id) });
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل إعادة تعيين كلمة المرور" : "Failed to reset password"));
    }
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success(isAr ? "تم النسخ إلى الحافظة" : "Copied to clipboard");
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error(isAr ? "تعذر النسخ" : "Failed to copy");
    }
  };

  const handleGeneratePassword = () => {
    const pwd = generateSecureTempPassword();
    setForm((f) => ({ ...f, password: pwd }));
    setShowPassword(true);
    toast.success(isAr ? "تم توليد كلمة مرور مؤقتة" : "Temporary password generated");
  };

  const handleGenerateEditPassword = () => {
    const pwd = generateSecureTempPassword();
    setEditPassword(pwd);
    setShowEditPassword(true);
    toast.success(isAr ? "تم توليد كلمة مرور جديدة" : "New password generated");
  };

  const resetForm = () => {
    setForm({
      email: "",
      name: "",
      phone: "",
      password: "",
      must_change_password: true,
      role: "staff",
      permissions: [],
    });
    setShowPassword(false);
  };

  const handleAdd = async () => {
    if (!form.email.trim()) {
      toast.error(isAr ? "البريد الإلكتروني مطلوب" : "Email is required");
      return;
    }

    const memberLimit = entitlements?.limits?.["team.members_limit"];
    const isUnlimited = memberLimit === -1;
    const currentMemberCount = (staffQ.data || []).length;
    if (
      !isUnlimited &&
      typeof memberLimit === "number" &&
      memberLimit > 0 &&
      currentMemberCount >= memberLimit
    ) {
      toast.error(
        isAr
          ? `لقد وصلت إلى الحد الأقصى لعدد أعضاء الفريق في باقتك الحالية (${memberLimit} أعضاء). يرجى ترقية باقتك لإضافة المزيد.`
          : `You have reached the team members limit for your plan (${memberLimit} members). Please upgrade your plan to add more.`,
      );
      return;
    }

    try {
      const result = await callUserManagement("create", {
        email: form.email.trim(),
        name: form.name.trim() || undefined,
        phone: form.phone.trim() || undefined,
        password: form.password,
        must_change_password: form.must_change_password,
        role: form.role,
        // Attach the new user to the brand this team page is scoped to
        brand_id: form.role === "super_admin" ? null : brand.id,
        permissions: form.role === "staff" ? form.permissions : [],
      });
      toast.success(
        result.linked_existing_identity
          ? isAr
            ? "تم منح حساب العميل الحالي صلاحية الفريق مع الاحتفاظ بكلمة مروره وبياناته"
            : "Team access added to the existing customer account. Its password and customer data were preserved."
          : isAr
            ? "تمت إضافة المستخدم بنجاح"
            : "User added successfully",
      );
      setAddOpen(false);

      if (!result.linked_existing_identity && form.password) {
        setCredentialsModal({
          isOpen: true,
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          tempPassword: form.password,
          mustChangePassword: form.must_change_password,
          storeName: isAr ? brand.name_ar || brand.name_en : brand.name_en,
        });
      }

      resetForm();
      qc.invalidateQueries({ queryKey: queryKeys.staff.all(brand.id) });
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل إضافة المستخدم" : "Failed to add user"));
    }
  };

  const handleUpdate = async (
    userId: string,
    updates: {
      role?: UserRole;
      status?: UserStatus;
      name?: string;
      phone?: string | null;
      permissions?: string[];
      password?: string;
      must_change_password?: boolean;
    },
  ) => {
    try {
      await callUserManagement("update", { userId, ...updates });
      toast.success(isAr ? "تم التحديث بنجاح" : "Updated successfully");
      setEditOpen(false);

      if (updates.password) {
        setCredentialsModal({
          isOpen: true,
          name: editing?.name || "",
          email: editing?.email || "",
          phone: (updates.phone !== undefined ? updates.phone : editing?.phone) || undefined,
          tempPassword: updates.password,
          mustChangePassword: Boolean(updates.must_change_password),
          storeName: isAr ? brand.name_ar || brand.name_en : brand.name_en,
        });
      }

      setEditing(null);
      setEditPassword("");
      setShowEditPassword(false);
      qc.invalidateQueries({ queryKey: queryKeys.staff.all(brand.id) });
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل التحديث" : "Failed to update"));
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      await callUserManagement("delete", { userId });
      toast.success(isAr ? "تم حذف المستخدم" : "User deleted");
      setDeleteConfirm(null);
      qc.invalidateQueries({ queryKey: queryKeys.staff.all(brand.id) });
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل الحذف" : "Failed to delete"));
    }
  };

  const openEdit = (member: StaffMember) => {
    setEditing(member);
    setEditPassword("");
    setEditOpen(true);
  };

  const [statusScope, setStatusScope] = useState<TeamStatusScope>("all");

  const staff = staffQ.data ?? [];
  const filteredStaff = staff.filter((m) => {
    if (statusScope === "active") return m.status === "active";
    if (statusScope === "inactive") return m.status === "inactive";
    return true;
  });

  const scopeCounts = {
    all: staff.length,
    active: staff.filter((m) => m.status === "active").length,
    inactive: staff.filter((m) => m.status === "inactive").length,
  };

  const locale = isAr ? "ar-BH-u-nu-latn" : "en-US";
  const adminMembers = staff.filter(
    (m) => m.role === "admin" || m.role === "super_admin" || m.role === "brand_admin",
  );
  const isSingleAdmin = !staffQ.isLoading && adminMembers.length <= 1;
  const adminHasNoPhone = adminMembers.length > 0 && adminMembers.every((m) => !m.phone);

  return (
    <div className="space-y-3.5">
      {/* 1. Command Header */}
      <TeamCommandHeader
        lang={isAr ? "ar" : "en"}
        brandName={(isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug}
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
                  {isAr ? "كلمة المرور المؤقتة (للحسابات الجديدة)" : "Temporary Password (new accounts)"}
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
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {isAr
                        ? "سيتم تحويل الموظف تلقائياً لصفحة إعداد كلمة المرور الخاصة به فور تسجيل الدخول ولا يمكنه تصفح لوحة التحكم قبل إكمالها."
                        : "The user will be redirected to the password setup screen upon first login and blocked from dashboard access until updated."}
                    </p>
                  </div>
                </div>
              ) : null}

              <p className="text-[11px] text-muted-foreground">
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
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        {isAr ? "مدير" : "Admin"}
                      </div>
                    </SelectItem>
                  )}
                  {isSuperAdmin && (
                    <SelectItem value="brand_admin">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        {isAr ? "مدير علامة تجارية" : "Brand Admin"}
                      </div>
                    </SelectItem>
                  )}
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
                        onClick={() =>
                          setForm({ ...form, permissions: [...preset.permissions] })
                        }
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
                    <span className="font-bold text-base truncate">
                      {member.name || member.email.split("@")[0]}
                    </span>
                    <span className="text-xs text-muted-foreground truncate" dir="ltr">
                      {member.email}
                    </span>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
                    {member.must_change_password && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium border border-amber-500/25">
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
                    {Array.isArray((member as any).permissions) && (member as any).permissions.length > 0 ? (
                      (member as any).permissions.map((pId: string) => {
                        const permObj = AVAILABLE_PERMISSIONS.find((p) => p.id === pId);
                        return (
                          <span
                            key={pId}
                            className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium"
                          >
                            {isAr ? permObj?.labelAr || pId : permObj?.labelEn || pId}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">
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
                            title={isAr ? "إعادة تعيين كلمة مرور مؤقتة فورية" : "Quick Reset Temporary Password"}
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
                                      className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium"
                                    >
                                      {isAr ? permObj?.labelAr || pId : permObj?.labelEn || pId}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-[11px] text-muted-foreground italic">
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
                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium border border-amber-500/20 whitespace-nowrap">
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
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          {isAr ? "مدير" : "Admin"}
                        </div>
                      </SelectItem>
                    )}
                    {(isSuperAdmin || editing.role === "brand_admin") && (
                      <SelectItem value="brand_admin">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          {isAr ? "مدير علامة تجارية" : "Brand Admin"}
                        </div>
                      </SelectItem>
                    )}
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
                          <span className="text-xs font-medium">{isAr ? p.labelAr : p.labelEn}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-staff-password">
                    {isAr ? "تعيين أو إعادة تعيين كلمة المرور (اختياري)" : "Set / Reset Password (optional)"}
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
                    {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {editPassword.trim() ? (
                  <div className="flex items-start gap-2 pt-1.5 p-2.5 rounded-lg bg-secondary/40 border border-border">
                    <Checkbox
                      id="edit-require-password-change"
                      checked={editMustChangePassword}
                      onCheckedChange={(checked) =>
                        setEditMustChangePassword(Boolean(checked))
                      }
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
                      <p className="text-[11px] text-muted-foreground leading-tight">
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

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(v) => {
          if (!v) setDeleteConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAr ? "حذف المستخدم" : "Delete User"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm && (
                <>
                  {isAr ? (
                    <>
                      هل أنت متأكد من إزالة صلاحية الفريق عن{" "}
                      <strong>{deleteConfirm.name || deleteConfirm.email}</strong>؟
                      <br />
                      إذا كان لديه حساب عميل فسيتم الاحتفاظ بملفه وكلمة مروره وطلباته وعناوينه.
                    </>
                  ) : (
                    <>
                      Are you sure you want to delete{" "}
                      <strong>{deleteConfirm.name || deleteConfirm.email}</strong>?
                      <br />
                      Team access will be removed. If this person also has a customer account, their
                      password, orders, addresses, and customer data will be preserved.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Team Member Credentials Card Modal */}
      <Dialog
        open={Boolean(credentialsModal?.isOpen)}
        onOpenChange={(v) => {
          if (!v) setCredentialsModal(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary font-semibold text-xs mb-1">
              <ShieldCheck className="h-4 w-4" />
              {isAr ? "بطاقة بيانات الدخول الآمنة" : "Secure Member Credentials"}
            </div>
            <DialogTitle className="text-xl font-bold font-display">
              {isAr ? "بيانات تسجيل الدخول للعضو" : "Member Login Credentials"}
            </DialogTitle>
          </DialogHeader>

          {credentialsModal && (
            <div className="space-y-4 py-2">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5">
                <KeyRound className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="leading-relaxed">
                  {credentialsModal.mustChangePassword
                    ? isAr
                      ? "تم تعيين كلمة المرور ككلمة مرور مؤقتة. سيُطلب من العضو تغييرها فور أول تسجيل دخول قبل الوصول للوحة التحكم."
                      : "This temporary password has been set. The member will be required to change it on their first login."
                    : isAr
                      ? "تم تحديث كلمة المرور بنجاح. يمكن للعضو الدخول بها مباشرة."
                      : "Password updated successfully. The member can use it to sign in directly."}
                </div>
              </div>

              {/* Credential rows */}
              <div className="space-y-2.5 rounded-xl border border-border bg-card p-3.5 text-xs">
                {/* Member Name */}
                {credentialsModal.name && (
                  <div className="flex items-center justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">{isAr ? "الاسم:" : "Name:"}</span>
                    <span className="font-semibold text-foreground">{credentialsModal.name}</span>
                  </div>
                )}

                {/* Phone */}
                {credentialsModal.phone && (
                  <div className="flex items-center justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">{isAr ? "الهاتف / الواتساب:" : "Phone / WhatsApp:"}</span>
                    <span className="font-mono font-medium text-emerald-700 dark:text-emerald-400" dir="ltr">
                      {credentialsModal.phone}
                    </span>
                  </div>
                )}

                {/* Email */}
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">{isAr ? "البريد الإلكتروني:" : "Email:"}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-foreground" dir="ltr">
                      {credentialsModal.email}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => copyToClipboard(credentialsModal.email, "email")}
                    >
                      {copiedKey === "email" ? (
                        <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Temp Password */}
                {credentialsModal.tempPassword && (
                  <div className="flex items-center justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">
                      {isAr ? "كلمة المرور المؤقتة:" : "Temporary Password:"}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-primary tracking-wider" dir="ltr">
                        {credentialsModal.tempPassword}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          copyToClipboard(credentialsModal.tempPassword || "", "password")
                        }
                      >
                        {copiedKey === "password" ? (
                          <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Login URL */}
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">
                    {isAr ? "رابط تسجيل الدخول:" : "Login URL:"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground text-[11px]" dir="ltr">
                      {window.location.origin}/auth
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        copyToClipboard(`${window.location.origin}/auth`, "url")
                      }
                    >
                      {copiedKey === "url" ? (
                        <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Action Buttons for sharing */}
              <div className="space-y-2 pt-2">
                <Button
                  className="w-full gap-2 font-medium"
                  onClick={() => {
                    const msg = formatTeamInviteMessage({
                      name: credentialsModal.name,
                      storeName: credentialsModal.storeName,
                      email: credentialsModal.email,
                      tempPassword: credentialsModal.tempPassword,
                      loginUrl: `${window.location.origin}/auth`,
                      lang: isAr ? "ar" : "en",
                    });
                    copyToClipboard(msg, "full_message");
                  }}
                >
                  {copiedKey === "full_message" ? (
                    <>
                      <CheckCheck className="h-4 w-4 text-emerald-300" />
                      {isAr ? "تم نسخ نص الدعوة كاملاً!" : "Full Invitation Copied!"}
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      {isAr
                        ? "نسخ رسالة الترحيب والبيانات (جاهزة للمشاركة)"
                        : "Copy Welcome Message (Ready to share)"}
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  className="w-full gap-2 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                  onClick={() => {
                    const msg = formatTeamInviteMessage({
                      name: credentialsModal.name,
                      storeName: credentialsModal.storeName,
                      email: credentialsModal.email,
                      tempPassword: credentialsModal.tempPassword,
                      loginUrl: `${window.location.origin}/auth`,
                      lang: isAr ? "ar" : "en",
                    });
                    const phoneDigits = credentialsModal.phone
                      ? credentialsModal.phone.replace(/\D/g, "")
                      : "";
                    const waUrl = phoneDigits
                      ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`
                      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                    window.open(waUrl, "_blank");
                  }}
                >
                  <MessageCircle className="h-4 w-4" />
                  {credentialsModal.phone
                    ? isAr
                      ? `إرسال عبر واتساب إلى ${credentialsModal.phone}`
                      : `Send via WhatsApp to ${credentialsModal.phone}`
                    : isAr
                      ? "مشاركة فورية عبر واتساب"
                      : "Share via WhatsApp"}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setCredentialsModal(null)}
            >
              {isAr ? "إغلاق" : "Done"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
