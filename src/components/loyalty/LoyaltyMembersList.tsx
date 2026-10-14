import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { loyaltyQueries } from "@/lib/data/loyalty";
import { loyaltyMembers } from "@/lib/loyalty-program";
import type { LoyaltyTier } from "@/lib/loyalty.types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * Who has points: every member with what they can spend now, what is still held, and their
 * tier. Before, the only way to see a customer's balance was to read the ledger.
 */
export function LoyaltyMembersList({
  brandId,
  tiers,
  isAr,
}: {
  brandId: string;
  tiers: readonly Pick<LoyaltyTier, "tier_key" | "name_ar" | "name_en">[];
  isAr: boolean;
}) {
  const [search, setSearch] = useState("");
  const { data: rows = [], isLoading } = useQuery(loyaltyQueries.members(brandId));
  const members = useMemo(() => loyaltyMembers(rows, search), [rows, search]);
  const tierName = (key: string) => {
    const tier = tiers.find((t) => t.tier_key === key);
    return tier ? (isAr ? tier.name_ar : tier.name_en) : null;
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isAr ? "ابحث بالاسم أو الرقم" : "Search by name or phone"}
          aria-label={isAr ? "ابحث في الأعضاء" : "Search members"}
          className="ps-9"
        />
      </div>

      {!isLoading && members.length === 0 && (
        <Card className="flex items-center gap-3 border-dashed p-5 text-sm text-muted-foreground">
          <Users className="h-5 w-5 shrink-0" />
          {search
            ? isAr
              ? "لا عضو يطابق البحث."
              : "No member matches the search."
            : isAr
              ? "لا أعضاء بعد: يصبح العميل عضواً عندما يكسب أول نقاطه."
              : "No members yet: a customer joins when they earn their first points."}
        </Card>
      )}

      <ul className="space-y-2">
        {members.map((member) => {
          const tier = tierName(member.tierKey);
          return (
            <li key={member.customerId}>
              <Card className="flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p
                    dir="auto"
                    className="text-page-start line-clamp-2 break-words text-sm font-semibold text-foreground"
                  >
                    {member.name || (isAr ? "عميل بلا اسم" : "Unnamed customer")}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {member.phone && <span dir="ltr">{member.phone}</span>}
                    {tier && <span>{tier}</span>}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="font-mono text-base font-bold text-foreground">
                    {member.available.toLocaleString("en")}
                    <span className="ms-1 font-sans text-xs font-medium text-muted-foreground">
                      {isAr ? "نقطة" : "pts"}
                    </span>
                  </p>
                  {member.held > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? `${member.held.toLocaleString("en")} قيد الانتظار`
                        : `${member.held.toLocaleString("en")} held`}
                    </p>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
