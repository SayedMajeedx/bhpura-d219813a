import React from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Save,
  Building2,
  Store,
  CreditCard,
  Truck,
  Mail,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SettingsStickySaveBarProps {
  activeTab: string;
  isSaving: boolean;
  onSave: () => void | Promise<void>;
  isAr?: boolean;
  className?: string;
}

const TAB_META: Record<
  string,
  { labelAr: string; labelEn: string; icon: React.ComponentType<{ className?: string }> }
> = {
  business: {
    labelAr: "الملف التجاري والأساسي",
    labelEn: "Business Profile",
    icon: Building2,
  },
  invoice: {
    labelAr: "إعدادات الفاتورة والضريبة",
    labelEn: "Invoice & Tax",
    icon: FileText,
  },
  storefront: {
    labelAr: "واجهة المتجر والتصميم",
    labelEn: "Storefront & Theme",
    icon: Store,
  },
  checkout: {
    labelAr: "الشحن والاستلام والتوصيل",
    labelEn: "Fulfillment & Shipping",
    icon: Truck,
  },
  payments: {
    labelAr: "طرق وبوابات الدفع",
    labelEn: "Payment Gateways",
    icon: CreditCard,
  },
  emails: {
    labelAr: "إشعارات البريد والرسائل",
    labelEn: "Notifications & Messages",
    icon: Mail,
  },
};

export function SettingsStickySaveBar({
  activeTab,
  isSaving,
  onSave,
  isAr = true,
  className,
}: SettingsStickySaveBarProps) {
  const meta = TAB_META[activeTab];
  if (!meta) return null;

  const Icon = meta.icon;

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className={cn(
        "fixed inset-x-0 z-30 pointer-events-none px-4 transition-all duration-300",
        // Floating above mobile bottom dock, and neat at the bottom on desktop
        "bottom-20 md:bottom-4",
        className,
      )}
    >
      <div className="max-w-4xl mx-auto pointer-events-auto">
        <div className="flex items-center justify-between gap-3 p-2.5 sm:px-4 sm:py-3 rounded-2xl bg-card/95 backdrop-blur-md border border-border shadow-xl">
          {/* Active Tab indicator & Guidance */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-foreground truncate">
                  {isAr ? meta.labelAr : meta.labelEn}
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              </div>
              <p className="text-[11px] text-muted-foreground hidden sm:block truncate">
                {isAr
                  ? "احفظ التغييرات لتطبيقها فوراً على متجرك"
                  : "Save changes to apply immediately to your store"}
              </p>
            </div>
          </div>

          {/* Unified Action Button */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              size="default"
              className={cn(
                "min-h-[44px] px-4 sm:px-6 font-semibold text-xs sm:text-sm gap-2 shadow-md transition-all",
                "hover:shadow-lg active:scale-98",
              )}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>{isAr ? "جارٍ الحفظ..." : "Saving..."}</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 shrink-0" />
                  <span>{isAr ? "حفظ التغييرات" : "Save Changes"}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
