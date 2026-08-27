import React, { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
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
import { SafeAreaView } from "react-native-safe-area-context";
import {
  BrandAvatar,
  Card,
  EmptyState,
  Field,
  MetricCard,
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui";
import { AppIcon, Icons } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { colors, radius, shadow } from "@/theme";
import { formatDate, formatMoney } from "@/lib/format";

type ExpenseItem = {
  id: string;
  brand_id: string;
  amount: number;
  category: string;
  description: string | null;
  payment_method: string | null;
  expense_date: string;
  created_at: string;
};

const EXPENSE_CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: "opex", label: "تشغيل عام", icon: "⚙️" },
  { key: "cogs", label: "تكلفة بضاعة", icon: "📦" },
  { key: "marketing", label: "تسويق وإعلانات", icon: "📢" },
  { key: "shipping", label: "شحن وتوصيل", icon: "🚚" },
  { key: "packaging", label: "تغليف ومطبوعات", icon: "🛍️" },
  { key: "rent", label: "إيجار ومرافق", icon: "🏢" },
  { key: "other", label: "أخرى", icon: "📝" },
];

export default function ExpensesScreen() {
  const {
    profile,
    brands,
    activeBrand,
    activeBrandId,
    setActiveBrandId,
    currency,
    canViewFinancials,
    signOut,
  } = useAuth();

  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [totalMonthExpense, setTotalMonthExpense] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add Expense Sheet
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("opex");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("benefit_pay");
  const [submitting, setSubmitting] = useState(false);

  // Brand Switcher Sheet
  const [brandModalVisible, setBrandModalVisible] = useState(false);

  const loadExpenses = useCallback(async () => {
    if (!activeBrandId) return;

    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("brand_id", activeBrandId)
        .order("expense_date", { ascending: false })
        .limit(50);

      if (error) throw error;
      const list = (data ?? []) as ExpenseItem[];
      setExpenses(list);

      // Calculate this month's expenses
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthSum = list
        .filter((e) => e.expense_date >= firstDayOfMonth)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);

      setTotalMonthExpense(monthSum);
    } catch (err: any) {
      Alert.alert("خطأ", err.message || "تعذر تحميل المصروفات");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeBrandId]);

  useFocusEffect(
    useCallback(() => {
      void loadExpenses();
    }, [loadExpenses]),
  );

  const handleAddExpense = async () => {
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert("تنبيه", "يرجى إدخال مبلغ صحيح أكبر من صفر");
      return;
    }
    if (!activeBrandId) return;

    setSubmitting(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const { error } = await supabase.from("expenses").insert({
        brand_id: activeBrandId,
        amount: parsedAmount,
        category,
        description: description.trim() || null,
        payment_method: paymentMethod,
        expense_date: today,
      });

      if (error) throw error;

      Alert.alert("تم الحفظ", "تم تسجيل المصروف بنجاح");
      setAmount("");
      setDescription("");
      setAddModalVisible(false);
      void loadExpenses();
    } catch (err: any) {
      Alert.alert("خطأ", err.message || "تعذر حفظ المصروف");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert("تسجيل الخروج", "هل أنت متأكد من رغبتك في تسجيل الخروج من هذا الحساب؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "تسجيل الخروج",
        style: "destructive",
        onPress: () => void signOut(),
      },
    ]);
  };

  const getCategoryLabel = (cat: string) => {
    const found = EXPENSE_CATEGORIES.find((c) => c.key === cat);
    return found ? `${found.icon} ${found.label}` : cat;
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerContainer}>
        <Text style={styles.screenTitle}>المصروفات والإعدادات</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadExpenses();
              }}
            />
          }
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.topSection}>
              {canViewFinancials ? (
                <MetricCard
                  title="إجمالي مصروفات هذا الشهر"
                  value={formatMoney(totalMonthExpense, currency)}
                  subtitle="مجموع كل الفئات المسجلة"
                  icon={<Icons.Expenses size={22} color={colors.danger} />}
                  highlight
                />
              ) : null}

              <PrimaryButton
                title="تسجيل مصروف جديد"
                icon={<Icons.Plus size={20} color="#fff" />}
                onPress={() => setAddModalVisible(true)}
                variant="brand"
              />

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>سجل المصروفات الأخيرة</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              title="لا توجد مصروفات مسجلة"
              description="سجّل مصاريف التشغيل والتسويق لمتابعة الأرباح بدقة."
              icon={<Icons.Expenses size={40} color={colors.muted} />}
            />
          }
          renderItem={({ item }) => (
            <Card style={styles.expenseCard}>
              <View style={styles.expenseLeft}>
                <Text style={styles.expenseAmount}>- {formatMoney(item.amount, currency)}</Text>
                <Text style={styles.expenseDate}>{formatDate(item.expense_date)}</Text>
              </View>

              <View style={styles.expenseRight}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{getCategoryLabel(item.category)}</Text>
                </View>
                {item.description ? (
                  <Text style={styles.expenseDesc}>{item.description}</Text>
                ) : null}
                <Text style={styles.expenseMethod}>
                  {item.payment_method === "benefit_pay"
                    ? "💳 BenefitPay"
                    : item.payment_method === "cash"
                      ? "💵 نقداً"
                      : "🏦 تحويل / بطاقة"}
                </Text>
              </View>
            </Card>
          )}
          ListFooterComponent={
            <View style={styles.footerSection}>
              <Text style={styles.sectionTitle}>إعدادات الحساب والمتجر</Text>

              {/* Active Brand Card */}
              <Card style={styles.settingsCard}>
                <View style={styles.brandRow}>
                  {brands.length > 1 ? (
                    <SecondaryButton
                      title="تبديل"
                      onPress={() => setBrandModalVisible(true)}
                      style={styles.switchBtn}
                    />
                  ) : null}
                  <View style={styles.brandMeta}>
                    <Text style={styles.brandName}>
                      {activeBrand?.name_ar || activeBrand?.name_en || "Boutq Store"}
                    </Text>
                    <Text style={styles.brandSlug}>@{activeBrand?.slug}</Text>
                  </View>
                  <BrandAvatar
                    name={activeBrand?.name_ar || activeBrand?.name_en || "B"}
                    logoUrl={activeBrand?.logo_url}
                    size={46}
                  />
                </View>
              </Card>

              {/* User Profile Card */}
              <Card style={styles.settingsCard}>
                <View style={styles.profileRow}>
                  <View style={styles.profileMeta}>
                    <Text style={styles.profileName}>
                      {profile?.full_name || profile?.name || "المستخدم"}
                    </Text>
                    <Text style={styles.profileEmail}>{profile?.email || "Staff Account"}</Text>
                    <Text style={styles.profileRole}>الصلاحية: {profile?.role || "admin"}</Text>
                  </View>
                  <View style={styles.profileAvatar}>
                    <AppIcon name="shield-checkmark" size={24} color={colors.primary} />
                  </View>
                </View>
              </Card>

              {/* Sign Out Button */}
              <PrimaryButton
                title="تسجيل الخروج"
                icon={<AppIcon name="close-circle" size={20} color="#fff" />}
                onPress={handleSignOut}
                variant="danger"
              />
            </View>
          }
        />
      )}

      {/* Add Expense Modal Sheet */}
      <ModalSheet
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        title="تسجيل مصروف جديد"
      >
        <View style={styles.formContainer}>
          <Text style={styles.inputLabel}>المبلغ ({currency}):</Text>
          <Field
            value={amount}
            onChangeText={setAmount}
            placeholder="0.000"
            keyboardType="decimal-pad"
            style={styles.amountInput}
          />

          <Text style={styles.inputLabel}>التصنيف:</Text>
          <View style={styles.categoryGrid}>
            {EXPENSE_CATEGORIES.map((cat) => {
              const selected = category === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => setCategory(cat.key)}
                  style={[styles.categoryOption, selected && styles.categoryOptionSelected]}
                >
                  <Text
                    style={[styles.categoryOptionText, selected && styles.categoryOptionTextActive]}
                  >
                    {cat.icon} {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.inputLabel}>الوصف أو البيان (اختياري):</Text>
          <Field
            value={description}
            onChangeText={setDescription}
            placeholder="مثال: فاتورة توصيل أو أكياس تغليف"
          />

          <Text style={styles.inputLabel}>طريقة الدفع:</Text>
          <View style={styles.methodRow}>
            {[
              { key: "benefit_pay", label: "BenefitPay" },
              { key: "cash", label: "نقداً" },
              { key: "card", label: "بطاقة / بنك" },
            ].map((m) => {
              const selected = paymentMethod === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setPaymentMethod(m.key)}
                  style={[styles.methodBtn, selected && styles.methodBtnSelected]}
                >
                  <Text style={[styles.methodText, selected && styles.methodTextActive]}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <PrimaryButton
            title="حفظ المصروف"
            onPress={handleAddExpense}
            loading={submitting}
            variant="brand"
            style={{ marginTop: 10 }}
          />
        </View>
      </ModalSheet>

      {/* Brand Switcher Modal Sheet */}
      <ModalSheet
        visible={brandModalVisible}
        onClose={() => setBrandModalVisible(false)}
        title="تبديل المتجر النشط"
      >
        <View style={styles.brandList}>
          {brands.map((b) => {
            const isSelected = b.id === activeBrandId;
            return (
              <Pressable
                key={b.id}
                onPress={() => {
                  setActiveBrandId(b.id);
                  setBrandModalVisible(false);
                }}
                style={[styles.brandItem, isSelected && styles.brandItemActive]}
              >
                {isSelected ? (
                  <Icons.Check size={20} color={colors.brand} />
                ) : (
                  <View style={{ width: 20 }} />
                )}
                <View style={styles.brandItemInfo}>
                  <Text style={[styles.brandItemName, isSelected && styles.brandItemNameActive]}>
                    {b.name_ar || b.name_en}
                  </Text>
                  <Text style={styles.brandItemSlug}>@{b.slug}</Text>
                </View>
                <BrandAvatar name={b.name_ar || b.name_en} logoUrl={b.logo_url} size={40} />
              </Pressable>
            );
          })}
        </View>
      </ModalSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  screenTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "right",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  topSection: {
    gap: 14,
    marginBottom: 4,
  },
  sectionHeader: {
    marginTop: 6,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "right",
  },
  expenseCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  expenseLeft: {
    alignItems: "flex-start",
    gap: 4,
  },
  expenseRight: {
    alignItems: "flex-end",
    flex: 1,
    marginLeft: 12,
    gap: 3,
  },
  expenseAmount: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: "900",
  },
  expenseDate: {
    color: colors.muted,
    fontSize: 11,
  },
  categoryBadge: {
    backgroundColor: colors.bgSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  categoryText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  expenseDesc: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },
  expenseMethod: {
    color: colors.muted,
    fontSize: 11,
  },
  footerSection: {
    marginTop: 20,
    gap: 14,
  },
  settingsCard: {
    gap: 10,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchBtn: {
    minHeight: 38,
    paddingHorizontal: 12,
  },
  brandMeta: {
    alignItems: "flex-end",
    flex: 1,
    marginRight: 12,
  },
  brandName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  brandSlug: {
    color: colors.muted,
    fontSize: 12,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileMeta: {
    alignItems: "flex-end",
    flex: 1,
    marginRight: 12,
    gap: 2,
  },
  profileName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  profileEmail: {
    color: colors.muted,
    fontSize: 13,
  },
  profileRole: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  profileAvatar: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  formContainer: {
    gap: 12,
  },
  inputLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
  },
  amountInput: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.brand,
  },
  categoryGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryOption: {
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryOptionSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  categoryOptionText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  categoryOptionTextActive: {
    color: "#fff",
  },
  methodRow: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  methodBtn: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: "center",
  },
  methodBtnSelected: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  methodText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  methodTextActive: {
    color: colors.brand,
    fontWeight: "900",
  },
  brandList: {
    gap: 8,
  },
  brandItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  brandItemActive: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  brandItemInfo: {
    flex: 1,
    marginRight: 12,
    alignItems: "flex-end",
  },
  brandItemName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  brandItemNameActive: {
    color: colors.brand,
  },
  brandItemSlug: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
});
