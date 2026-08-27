import React, { useEffect, useMemo, useState } from "react";
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
import {
  Card,
  EmptyState,
  Field,
  MetricCard,
  ModalSheet,
  PrimaryButton,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/theme";

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const { activeBrandId, currency } = useAuth();
  const { t, isAr } = useI18n();

  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const loadExpenses = async () => {
    if (!activeBrandId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("brand_id", activeBrandId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setExpenses(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadExpenses();
  }, [activeBrandId]);

  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [expenses]);

  const handleAddExpense = async () => {
    if (!amount.trim()) {
      Alert.alert(
        isAr ? "بيانات ناقصة" : "Missing amount",
        isAr ? "يرجى كتابة مبلغ المصروف" : "Please enter expense amount",
      );
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase.from("expenses").insert({
        brand_id: activeBrandId,
        category: category.trim() || (isAr ? "عام" : "General"),
        description: description.trim() || category.trim() || "Expense",
        amount: parseFloat(amount),
        notes: notes.trim() || null,
        expense_date: new Date().toISOString().split("T")[0],
      });

      if (error) throw error;

      setModalOpen(false);
      setCategory("");
      setDescription("");
      setAmount("");
      setNotes("");
      void loadExpenses();
    } catch (e: any) {
      Alert.alert(isAr ? "خطأ" : "Error", e.message || "Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadExpenses();
            }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.titleText}>{t("expenses.title")}</Text>
                <Text style={styles.subtitleText}>
                  {expenses.length} {isAr ? "سندات مصروفات" : "expense entries"}
                </Text>
              </View>
              <Pressable onPress={() => setModalOpen(true)} style={styles.addButton}>
                <AppIcon name="add" size={20} color={colors.primaryFg} />
                <Text style={styles.addButtonText}>{t("common.add")}</Text>
              </Pressable>
            </View>

            <MetricCard
              label={t("expenses.monthSummary")}
              value={formatMoney(totalExpenses, currency)}
              tone="danger"
            />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <EmptyState
              title={t("expenses.noExpenses")}
              description={
                isAr
                  ? "سجّل تكاليف الخياطة والأقمشة والشحن لحساب صافي الأرباح بدقة."
                  : "Track operational costs like fabric, tailoring, and delivery to calculate net profit."
              }
              actionLabel={t("expenses.addExpense")}
              onAction={() => setModalOpen(true)}
            />
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.expenseCard}>
            <View style={styles.expenseRow}>
              <View style={styles.iconBox}>
                <AppIcon name="receipt" size={20} color={colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.expenseCategory}>{item.category || item.description}</Text>
                {item.notes ? <Text style={styles.expenseNotes}>{item.notes}</Text> : null}
                <Text style={styles.expenseDate}>
                  {item.expense_date || new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.expenseAmount}>
                {formatMoney(item.amount, currency)}
              </Text>
            </View>
          </Card>
        )}
      />

      {/* Add Expense Sheet */}
      <ModalSheet
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t("expenses.addExpense")}
      >
        <View style={styles.form}>
          <Field
            label={t("expenses.category")}
            value={category}
            onChangeText={setCategory}
            placeholder={isAr ? "مثال: أقمشة، خياطة، تسويق، شحن" : "e.g. Fabric, Tailoring, Marketing"}
          />
          <Field
            label={t("expenses.amount")}
            value={amount}
            onChangeText={setAmount}
            placeholder={`0.000 (${currency})`}
            keyboardType="decimal-pad"
          />
          <Field
            label={t("expenses.notes")}
            value={notes}
            onChangeText={setNotes}
            placeholder={isAr ? "ملاحظات إضافية (اختياري)..." : "Additional details..."}
            multiline
          />
          <PrimaryButton
            title={t("common.save")}
            onPress={handleAddExpense}
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
  headerBlock: {
    gap: 14,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  expenseCard: {
    padding: 12,
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    alignItems: "center",
    justifyContent: "center",
  },
  expenseCategory: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  expenseNotes: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  expenseDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.danger,
  },
  form: {
    gap: 14,
    paddingVertical: 8,
  },
});
