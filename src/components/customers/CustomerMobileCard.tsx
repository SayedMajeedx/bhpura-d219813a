import React from "react";
import { formatMoney } from "@/lib/format";
import {
  Users,
  Star,
  Phone,
  Mail,
  MapPin,
  ChevronRight,
  MessageCircle,
  RefreshCw,
  UserPlus,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { regionLabel } from "@/lib/bahrain-regions";
import { maskPhoneForList } from "@/lib/privacy";

interface CustomerMobileCardProps {
  lang: "en" | "ar";
  customer: any;
  defaultAddress: any;
  stats: any;
  currency: string;
  onSelect: (customerId: string) => void;
  selected?: boolean;
  onToggleSelected?: (customerId: string) => void;
}

export const CustomerMobileCard: React.FC<CustomerMobileCardProps> = ({
  lang,
  customer,
  defaultAddress,
  stats,
  currency,
  onSelect,
  selected = false,
  onToggleSelected = () => undefined,
}) => {
  const isAr = lang === "ar";
  const regionText = regionLabel(
    defaultAddress?.region || customer.region || customer.city || "",
    lang,
  );
  const cleanPhone = customer.phone ? customer.phone.replace(/[^\d+]/g, "") : "";

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => onSelect(customer.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect(customer.id);
      }}
      className="p-3.5 rounded-xl bg-card border border-border-subtle shadow-2xs space-y-2.5 cursor-pointer hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 transition-all"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div onClick={(event) => event.stopPropagation()} className="shrink-0 flex items-center">
            <Checkbox
              checked={selected}
              onCheckedChange={() => onToggleSelected(customer.id)}
              aria-label={
                isAr ? `تحديد العميل ${customer.name}` : `Select customer ${customer.name}`
              }
            />
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-sm shrink-0">
            {customer.name ? customer.name.charAt(0).toUpperCase() : "C"}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-xs text-foreground truncate flex items-center gap-1.5">
              <span>{customer.name}</span>
              {stats?.badge === "VIP" && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300/40">
                  <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                  VIP
                </span>
              )}
              {stats?.badge === "Churn Risk" && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-300/40">
                  <AlertCircle className="h-2.5 w-2.5 text-rose-600 dark:text-rose-400" />
                  {isAr ? "راكد" : "Churn"}
                </span>
              )}
              {stats?.badge === "New Buyer" && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-300/40">
                  <UserPlus className="h-2.5 w-2.5 text-blue-600 dark:text-blue-400" />
                  {isAr ? "جديد" : "New"}
                </span>
              )}
              {(stats?.badge === "Regular" ||
                (stats?.totalOrders > 1 &&
                  stats?.badge !== "VIP" &&
                  stats?.badge !== "Churn Risk")) && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300/40">
                  <RefreshCw className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
                  {isAr ? "متكرر" : "Repeat"}
                </span>
              )}
            </h3>
            {customer.phone && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5" dir="ltr">
                {maskPhoneForList(customer.phone)}
              </p>
            )}
          </div>
        </div>

        <ChevronRight
          className={`h-4 w-4 text-muted-foreground shrink-0 ${isAr ? "rotate-180" : ""}`}
        />
      </div>

      {/* Address & Email */}
      <div className="flex flex-col gap-1 text-xs text-muted-foreground pt-1 border-t border-border-subtle">
        {regionText && (
          <div className="flex items-center gap-1.5 truncate">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{regionText}</span>
          </div>
        )}
        {customer.email && (
          <div className="flex items-center gap-1.5 truncate font-mono text-xs" dir="ltr">
            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{customer.email}</span>
          </div>
        )}
      </div>

      {/* CRM Stats Footer & Quick WhatsApp Action */}
      <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">
              {isAr ? "الطلبات:" : "Orders:"}{" "}
              <b className="text-foreground">{stats?.totalOrders ?? 0}</b>
            </span>
            <span>•</span>
            <span className="font-mono text-xs font-extrabold text-foreground">
              {formatMoney(stats?.lifetimeSpend ?? 0, currency, lang)}
            </span>
          </div>
          {stats?.pendingAmount && stats.pendingAmount > 0 ? (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-sans">
              {isAr
                ? `(معلق: ${formatMoney(stats.pendingAmount, currency, lang)})`
                : `(Pending: ${formatMoney(stats.pendingAmount, currency, lang)})`}
            </span>
          ) : null}
        </div>

        {cleanPhone && (
          <a
            href={`https://wa.me/${cleanPhone.replace("+", "")}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span>{isAr ? "واتساب" : "WhatsApp"}</span>
          </a>
        )}
      </div>
    </div>
  );
};
