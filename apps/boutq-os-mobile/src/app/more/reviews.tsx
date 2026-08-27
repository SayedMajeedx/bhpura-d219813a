import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Card, EmptyState, MetricCard } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/theme";

export default function ReviewsScreen() {
  const insets = useSafeAreaInsets();
  const { activeBrandId } = useAuth();
  const { t, isAr } = useI18n();

  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReviews = async () => {
    if (!activeBrandId) return;
    try {
      setLoading(true);
      // Try to load from order_reviews or product_reviews
      const { data, error } = await supabase
        .from("order_reviews")
        .select("*")
        .eq("brand_id", activeBrandId)
        .order("created_at", { ascending: false });

      if (error) {
        // Fallback to rpc or empty
        const { data: rpcData } = await (supabase.rpc as any)("list_brand_order_reviews", {
          p_brand_id: activeBrandId,
        });
        setReviews(rpcData ?? []);
      } else {
        setReviews(data ?? []);
      }
    } catch (e) {
      console.error(e);
      setReviews([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadReviews();
  }, [activeBrandId]);

  const toggleApproval = async (id: string, current: boolean) => {
    try {
      setReviews((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_approved: !current } : r)),
      );
      await supabase
        .from("order_reviews")
        .update({ is_approved: !current })
        .eq("id", id);
    } catch (e) {
      console.error(e);
      void loadReviews();
    }
  };

  const avgRating =
    reviews.length > 0
      ? (
          reviews.reduce((sum, r) => sum + Number(r.rating || r.overall_rating || 5), 0) /
          reviews.length
        ).toFixed(1)
      : "5.0";

  return (
    <View style={styles.container}>
      <FlatList
        data={reviews}
        keyExtractor={(item, idx) => item.id || String(idx)}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadReviews();
            }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.metricsRow}>
              <MetricCard
                label={isAr ? "متوسط التقييم العام" : "Average Rating"}
                value={`⭐ ${avgRating} / 5`}
                tone="warning"
              />
              <MetricCard
                label={isAr ? "إجمالي التقييمات" : "Total Reviews"}
                value={String(reviews.length)}
                tone="primary"
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <EmptyState
              title={t("reviews.noReviews")}
              description={
                isAr
                  ? "ستظهر هنا آراء وتقييمات العملاء لمنتجاتك وخدماتك فور إرسالها."
                  : "Customer ratings and feedback on your products will appear here."
              }
            />
          )
        }
        renderItem={({ item }) => {
          const rating = item.rating || item.overall_rating || 5;
          return (
            <Card style={styles.reviewCard}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.customerName}>
                    {item.customer_name || item.customer_phone || (isAr ? "عميل مميز" : "Verified Customer")}
                  </Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <AppIcon
                        key={star}
                        name="star"
                        size={14}
                        color={star <= rating ? colors.warning : colors.border}
                      />
                    ))}
                    <Text style={styles.ratingText}>{rating}/5</Text>
                  </View>
                </View>
                <View style={styles.switchCol}>
                  <Text style={styles.switchLabel}>
                    {item.is_approved !== false ? (isAr ? "معروض" : "Shown") : (isAr ? "مخفي" : "Hidden")}
                  </Text>
                  <Switch
                    value={item.is_approved !== false}
                    onValueChange={() => toggleApproval(item.id, item.is_approved !== false)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                </View>
              </View>

              {item.comment || item.feedback ? (
                <Text style={styles.commentText}>
                  "{item.comment || item.feedback}"
                </Text>
              ) : null}

              {item.created_at ? (
                <Text style={styles.dateText}>
                  {new Date(item.created_at).toLocaleDateString(isAr ? "ar-BH" : "en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              ) : null}
            </Card>
          );
        }}
      />
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
    marginBottom: 8,
  },
  metricsRow: {
    gap: 10,
  },
  centerBox: {
    paddingVertical: 60,
    alignItems: "center",
  },
  reviewCard: {
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  customerName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    marginLeft: 4,
  },
  switchCol: {
    alignItems: "center",
    gap: 4,
  },
  switchLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  commentText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    fontStyle: "italic",
    backgroundColor: colors.bgSoft,
    padding: 10,
    borderRadius: radius.md,
  },
  dateText: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
