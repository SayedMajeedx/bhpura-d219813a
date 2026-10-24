import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { generateSecureTempPassword } from "@/lib/team-credentials-utils";
import { toast } from "sonner";
import { useI18n, useT } from "@/lib/i18n";
import { useProfile, SUPER_ADMIN_EMAIL } from "@/lib/profile-context";
import { useBrand } from "@/lib/brand-context";
import type { UserRole, UserStatus } from "@/lib/profile-context";

import { type TeamStatusScope } from "@/components/team/TeamScopeSwitcher";
import { queryKeys } from "@/lib/query-keys";
import { useEntitlements } from "@/lib/saas-billing/use-entitlements";
import { callUserManagement } from "@/features/team/lib/team-shared";
import type { StaffMember } from "@/features/team/lib/team-shared";
import { adminWarnings, scopeCountsOf, staffInScope } from "@/features/team/lib/team-rules";
import { arNoun } from "@/lib/arabic-count";

/**
 * Everything the team page holds: the store's staff, the add and edit forms, a member's
 * permissions and passwords, and the credentials card shown once after an account is made.
 */

export function useTeamPage() {
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
      toast.error(
        err.message || (isAr ? "فشل إعادة تعيين كلمة المرور" : "Failed to reset password"),
      );
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
          ? `لقد وصلت إلى الحد الأقصى لعدد أعضاء الفريق في باقتك الحالية (${arNoun(memberLimit, "member")}). يرجى ترقية باقتك لإضافة المزيد.`
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
  const filteredStaff = staffInScope(staff, statusScope);

  const scopeCounts = scopeCountsOf(staff);

  const locale = isAr ? "ar-BH-u-nu-latn" : "en-US";
  const { isSingleAdmin, adminHasNoPhone } = adminWarnings(staff, staffQ.isLoading);

  return {
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
    currentUser,
    setDeleteConfirm,
    handleQuickResetTempPassword,
    handleUpdate,
    openEdit,
    staff,
    filteredStaff,
    locale,
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
    deleteConfirm,
    handleDelete,
    credentialsModal,
    setCredentialsModal,
    copiedKey,
    copyToClipboard,
    brand,
    statusScope,
    setStatusScope,
    scopeCounts,
    isSingleAdmin,
    adminHasNoPhone,
  };
}

export type TeamPageState = ReturnType<typeof useTeamPage>;
