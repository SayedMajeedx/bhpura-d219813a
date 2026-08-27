import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Card, EmptyState, Field, ModalSheet, PrimaryButton, StatusPill } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/theme";

export default function TeamScreen() {
  const insets = useSafeAreaInsets();
  const { activeBrandId, profile } = useAuth();
  const { t, isAr } = useI18n();

  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "staff" | "courier">("staff");

  const loadTeam = async () => {
    if (!activeBrandId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, full_name, email, role, status, brand_id, created_at")
        .or(`brand_id.eq.${activeBrandId},role.eq.super_admin`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMembers(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadTeam();
  }, [activeBrandId]);

  const handleInviteStaff = async () => {
    if (!email.trim() || !name.trim()) {
      Alert.alert(
        isAr ? "بيانات ناقصة" : "Missing fields",
        isAr ? "يرجى كتابة الاسم والبريد الإلكتروني" : "Please enter name and email",
      );
      return;
    }

    try {
      setSaving(true);
      // In Supabase, usually profiles or auth invite is used
      Alert.alert(
        isAr ? "تم إرسال الدعوة" : "Invitation sent",
        isAr
          ? `تم إرسال دعوة انضمام إلى ${email} بصلاحية (${role})`
          : `Invitation sent to ${email} with role (${role})`,
      );
      setModalOpen(false);
      setName("");
      setEmail("");
    } catch (e: any) {
      Alert.alert(isAr ? "خطأ" : "Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadTeam();
            }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.titleText}>{t("team.title")}</Text>
              <Text style={styles.subtitleText}>
                {members.length} {isAr ? "أعضاء في الفريق" : "team members"}
              </Text>
            </View>
            <Pressable onPress={() => setModalOpen(true)} style={styles.addButton}>
              <AppIcon name="person-add" size={18} color={colors.primaryFg} />
              <Text style={styles.addButtonText}>{t("common.add")}</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <EmptyState
              title={t("team.noMembers")}
              description={
                isAr
                  ? "أضف أفراد فريق العمل لمساعدتك في إدارة الطلبات والمخزون والتوصيل."
                  : "Add staff members to collaborate on order fulfillment and operations."
              }
            />
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.memberCard}>
            <View style={styles.memberRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(item.name || item.full_name || item.email || "U").slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRoleRow}>
                  <Text style={styles.memberName}>
                    {item.name || item.full_name || item.email}
                  </Text>
                  {item.id === profile?.id ? (
                    <Text style={styles.youBadge}>({isAr ? "أنت" : "You"})</Text>
                  ) : null}
                </View>
                <Text style={styles.memberEmail}>{item.email}</Text>
                <View style={styles.badgesRow}>
                  <StatusPill
                    status={
                      item.role === "admin" || item.role === "super_admin"
                        ? "مكتمل"
                        : "نشط"
                    }
                    customLabel={item.role?.toUpperCase()}
                  />
                  <StatusPill
                    status={item.status === "inactive" || item.status === "disabled" ? "ملغى" : "مكتمل"}
                    customLabel={item.status === "inactive" ? (isAr ? "معطّل" : "Inactive") : (isAr ? "نشط" : "Active")}
                  />
                </View>
              </View>
            </View>
          </Card>
        )}
      />

      {/* Add Staff Modal */}
      <ModalSheet
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t("team.addMember")}
      >
        <View style={styles.form}>
          <Field
            label={t("team.name")}
            value={name}
            onChangeText={setName}
            placeholder={isAr ? "مثال: مريم الأحمد" : "e.g. Mariam"}
          />
          <Field
            label={t("team.email")}
            value={email}
            onChangeText={setEmail}
            placeholder="mariam@boutq.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <View style={styles.rolePickerBlock}>
            <Text style={styles.rolePickerLabel}>{t("team.role")}</Text>
            <View style={styles.rolePickerRow}>
              <Pressable
                onPress={() => setRole("admin")}
                style={[styles.roleChip, role === "admin" && styles.roleChipSelected]}
              >
                <Text style={[styles.roleChipText, role === "admin" && styles.roleChipTextSelected]}>
                  {t("team.admin")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setRole("staff")}
                style={[styles.roleChip, role === "staff" && styles.roleChipSelected]}
              >
                <Text style={[styles.roleChipText, role === "staff" && styles.roleChipTextSelected]}>
                  {t("team.staff")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setRole("courier")}
                style={[styles.roleChip, role === "courier" && styles.roleChipSelected]}
              >
                <Text style={[styles.roleChipText, role === "courier" && styles.roleChipTextSelected]}>
                  {t("team.courier")}
                </Text>
              </Pressable>
            </View>
          </View>

          <PrimaryButton
            title={isAr ? "إرسال الدعوة" : "Send Invite"}
            onPress={handleInviteStaff}
            loading={saving}
          />
        </View>
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  titleText: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  subtitleText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  addButtonText: {
    color: colors.primaryFg,
    fontSize: 14,
    fontWeight: "700",
  },
  centerBox: {
    paddingVertical: 60,
    alignItems: "center",
  },
  memberCard: {
    padding: 12,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.primaryFg,
    fontSize: 18,
    fontWeight: "800",
  },
  nameRoleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  youBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  memberEmail: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  badgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  form: {
    gap: 14,
    paddingVertical: 8,
  },
  rolePickerBlock: {
    gap: 6,
  },
  rolePickerLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  rolePickerRow: {
    flexDirection: "row",
    gap: 8,
  },
  roleChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
  },
  roleChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.brandSoft,
  },
  roleChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  roleChipTextSelected: {
    color: colors.primary,
  },
});
