import * as React from "react";
import { useState, useContext } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Sparkles, X, Palette, Image, Type, Compass, Phone } from "lucide-react";
import {
  GroupNavigator,
  SettingsNavContext,
  type GroupDef,
} from "@/features/settings/GroupNavigator";
import { BasicsGroup } from "./BasicsGroup";
import { VerticalGroup } from "./VerticalGroup";
import { PaletteGroup } from "./PaletteGroup";
import { TypographyGroup } from "./TypographyGroup";
import { ContactGroup } from "./ContactGroup";

const INTRO_STORAGE_KEY = "boutq_settings_intro_dismissed";

function FirstVisitIntroBanner() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      if (typeof window !== "undefined") {
        return localStorage.getItem(INTRO_STORAGE_KEY) === "true";
      }
    } catch {
      // ignore
    }
    return false;
  });

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(INTRO_STORAGE_KEY, "true");
    } catch {
      // ignore
    }
  };

  const { setActiveGroup } = useContext(SettingsNavContext);
  const scrollToAnchor = (anchorId: string) => {
    // Groups render one at a time: select the group instead of scrolling to it.
    setActiveGroup(anchorId.replace(/^group-/, ""));
  };

  if (dismissed) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 sm:p-5 shadow-xs transition-all animate-in fade-in duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Sparkles className="size-4" />
            </span>
            <span className="text-sm font-bold text-foreground">
              {isAr
                ? "ابدأ من هنا: الشعار ← اللون ← الخط ← نوع النشاط"
                : "Start here: Logo → Color → Font → Business Vertical"}
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            {isAr
              ? "لتجهيز هوية متجرك بأفضل شكل وسرعة، نوصي باتباع الخطوات التالية بالترتيب: رفع شعار المتجر أولاً لاستخراج الألوان المتناسقة تلقائياً، ثم ضبط الخط العربي والنشاط التجاري."
              : "To set up your store identity effectively, we recommend following these steps in order: upload your logo first to extract colors automatically, then select fonts and business vertical."}
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => scrollToAnchor("group-basics")}
              className="h-7 text-xs gap-1.5 rounded-lg bg-background/80 hover:bg-background"
            >
              <Image className="size-3 text-primary" />
              <span>{isAr ? "1. الشعار والاسم" : "1. Logo & Name"}</span>
            </Button>

            <span className="text-muted-foreground text-xs rtl:rotate-180">→</span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => scrollToAnchor("group-palette")}
              className="h-7 text-xs gap-1.5 rounded-lg bg-background/80 hover:bg-background"
            >
              <Palette className="size-3 text-primary" />
              <span>{isAr ? "2. لوحة الألوان" : "2. Color Palette"}</span>
            </Button>

            <span className="text-muted-foreground text-xs rtl:rotate-180">→</span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => scrollToAnchor("group-typography")}
              className="h-7 text-xs gap-1.5 rounded-lg bg-background/80 hover:bg-background"
            >
              <Type className="size-3 text-primary" />
              <span>{isAr ? "3. الخطوط" : "3. Typography"}</span>
            </Button>

            <span className="text-muted-foreground text-xs rtl:rotate-180">→</span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => scrollToAnchor("group-vertical")}
              className="h-7 text-xs gap-1.5 rounded-lg bg-background/80 hover:bg-background"
            >
              <Compass className="size-3 text-primary" />
              <span>{isAr ? "4. نوع النشاط" : "4. Vertical"}</span>
            </Button>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          className="size-7 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
          title={isAr ? "إغلاق الإرشاد" : "Dismiss guidance"}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

const GROUPS: GroupDef[] = [
  { id: "basics", icon: Image, render: () => <BasicsGroup /> },
  { id: "vertical", icon: Compass, render: () => <VerticalGroup /> },
  { id: "palette", icon: Palette, render: () => <PaletteGroup /> },
  { id: "typography", icon: Type, render: () => <TypographyGroup /> },
  { id: "contact", icon: Phone, render: () => <ContactGroup /> },
];

export function IdentityTab() {
  return <GroupNavigator tab="identity" groups={GROUPS} before={<FirstVisitIntroBanner />} />;
}
