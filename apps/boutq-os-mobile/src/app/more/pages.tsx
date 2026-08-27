import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Card, Field, ModalSheet, PrimaryButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { colors, radius } from "@/theme";

type PageItem = {
  id: string;
  titleKey: string;
  contentAr: string;
  contentEn: string;
};

const INITIAL_PAGES: PageItem[] = [
  {
    id: "returns",
    titleKey: "pages.returns",
    contentAr:
      "يحق للعميل طلب الاستبدال أو الاسترجاع خلال ٣ أيام من تاريخ استلام الطلب، شريطة أن تكون القطعة بحالتها الأصلية وغير مستخدمة ومع بطاقة السعر الأصلية. يُستثنى من ذلك الطلبات المفصلة حسب المقاسات الخاصة.",
    contentEn:
      "Customers may request exchange or return within 3 days of delivery, provided the item is in its original unused condition with tags attached. Custom tailored pieces are non-refundable.",
  },
  {
    id: "terms",
    titleKey: "pages.terms",
    contentAr:
      "تخضع جميع الطلبات لتأكيد التوفر وموافقة المتجر. يتم تسليم الطلبات داخل البحرين خلال ٢٤-٤٨ ساعة عمل.",
    contentEn:
      "All orders are subject to stock confirmation. Delivery within Bahrain takes 24-48 business hours.",
  },
  {
    id: "about",
    titleKey: "pages.about",
    contentAr:
      "علامة تجارية متخصصة في تقديم أرقى تصاميم العبايات والأزياء العصرية بخامات فاخرة وخياطة متقنة.",
    contentEn:
      "A boutique brand dedicated to high-end contemporary abayas and fashion crafted from premium fabrics.",
  },
];

export default function PagesScreen() {
  const insets = useSafeAreaInsets();
  const { t, isAr } = useI18n();

  const [pages, setPages] = useState<PageItem[]>(INITIAL_PAGES);
  const [editingPage, setEditingPage] = useState<PageItem | null>(null);
  const [contentDraft, setContentDraft] = useState("");

  const handleEdit = (p: PageItem) => {
    setEditingPage(p);
    setContentDraft(isAr ? p.contentAr : p.contentEn);
  };

  const handleSave = () => {
    if (!editingPage) return;
    setPages((prev) =>
      prev.map((item) =>
        item.id === editingPage.id
          ? {
              ...item,
              [isAr ? "contentAr" : "contentEn"]: contentDraft,
            }
          : item,
      ),
    );
    setEditingPage(null);
    Alert.alert(isAr ? "تم الحفظ" : "Saved", isAr ? "تم حفظ محتوى الصفحة بنجاح" : "Page content updated successfully");
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
    >
      <Text style={styles.sectionHeader}>
        {isAr ? "صفحات وسياسات المتجر" : "Store Pages & Policies"}
      </Text>

      {pages.map((p) => {
        const text = isAr ? p.contentAr : p.contentEn;
        return (
          <Card key={p.id} style={styles.pageCard}>
            <View style={styles.pageHeader}>
              <View style={styles.iconBox}>
                <AppIcon name="document-text" size={20} color={colors.primary} />
              </View>
              <Text style={styles.pageTitle}>{t(p.titleKey)}</Text>
            </View>

            <Text style={styles.pageBody}>{text}</Text>

            <Pressable
              onPress={() => handleEdit(p)}
              style={styles.editButton}
            >
              <AppIcon name="pencil" size={14} color={colors.primary} />
              <Text style={styles.editButtonText}>{t("common.edit")}</Text>
            </Pressable>
          </Card>
        );
      })}

      {/* Edit Page Modal */}
      <ModalSheet
        visible={Boolean(editingPage)}
        onClose={() => setEditingPage(null)}
        title={editingPage ? t(editingPage.titleKey) : ""}
      >
        <View style={styles.form}>
          <Field
            label={isAr ? "نص الصفحة أو السياسة" : "Policy Content"}
            value={contentDraft}
            onChangeText={setContentDraft}
            multiline
            style={{ minHeight: 140 }}
          />
          <PrimaryButton
            title={t("common.save")}
            onPress={handleSave}
          />
        </View>
      </ModalSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  pageCard: {
    gap: 12,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  pageBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
    backgroundColor: colors.bgSoft,
    padding: 12,
    borderRadius: radius.md,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-end",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  form: {
    gap: 14,
    paddingVertical: 8,
  },
});
