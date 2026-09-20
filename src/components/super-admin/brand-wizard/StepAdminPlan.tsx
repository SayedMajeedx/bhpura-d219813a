import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { BrandWizardData } from "./types";
import { KeyRound, Smartphone, ShieldCheck, Calendar, Sparkles } from "lucide-react";

interface StepAdminPlanProps {
  data: BrandWizardData;
  onChange: (patch: Partial<BrandWizardData>) => void;
  isAr: boolean;
}

export function StepAdminPlan({ data, onChange, isAr }: StepAdminPlanProps) {
  const generateRandomPassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    onChange({ owner_password: pwd });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="font-semibold text-sm text-foreground flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {isAr ? "بيانات مدير البراند (Owner Account)" : "Brand Owner Account"}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="owner-name">
              {isAr ? "الاسم الكامل للمدير *" : "Owner Full Name *"}
            </Label>
            <Input
              id="owner-name"
              placeholder={isAr ? "مثال: سارة محمد" : "e.g. Sarah Al-Ahmad"}
              value={data.owner_name}
              onChange={(e) => onChange({ owner_name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="owner-email">{isAr ? "البريد الإلكتروني *" : "Email Address *"}</Label>
            <Input
              id="owner-email"
              type="email"
              placeholder="owner@boutique.com"
              value={data.owner_email}
              onChange={(e) => onChange({ owner_email: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="owner-phone">{isAr ? "رقم الهاتف" : "Phone Number"}</Label>
            <Input
              id="owner-phone"
              placeholder="+973 3900 0000"
              value={data.owner_phone}
              onChange={(e) => onChange({ owner_phone: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="owner-password">
                {isAr ? "كلمة المرور المؤقتة *" : "Temporary Password *"}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={generateRandomPassword}
                className="h-auto rounded-md text-xs text-primary hover:underline flex items-center gap-1 font-medium"
              >
                <KeyRound className="h-3 w-3" />
                {isAr ? "توليد كلمة سر" : "Generate"}
              </Button>
            </div>
            <Input
              id="owner-password"
              placeholder="Min. 8 characters"
              value={data.owner_password}
              onChange={(e) => onChange({ owner_password: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          {isAr ? "نوع الاشتراك (Plan Type)" : "Subscription Plan"}
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ plan_type: "annual" })}
            className={`h-auto rounded-md p-3.5 rounded-xl border text-start transition-all flex items-start gap-3 ${
              data.plan_type === "annual"
                ? "border-primary bg-primary/10 ring-1 ring-primary shadow-xs"
                : "border-border bg-card hover:bg-muted/40"
            }`}
          >
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="font-semibold text-sm text-foreground">
                {isAr ? "اشتراك سنوي نشط" : "Annual Active Plan"}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "تفعيل فوري لجميع مزايا المنصة لمدة سنة كاملة."
                  : "Immediate 1-year activation for all platform modules."}
              </p>
            </div>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ plan_type: "trial" })}
            className={`h-auto rounded-md p-3.5 rounded-xl border text-start transition-all flex items-start gap-3 ${
              data.plan_type === "trial"
                ? "border-primary bg-primary/10 ring-1 ring-primary shadow-xs"
                : "border-border bg-card hover:bg-muted/40"
            }`}
          >
            <div className="p-2 rounded-lg bg-muted text-foreground">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <div className="font-semibold text-sm text-foreground">
                {isAr ? "فترة تجريبية (Trial)" : "Trial Period"}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "فترة تجريبية مجانية محددة الأيام لتجربة المنصة."
                  : "Limited free trial period to evaluate the store OS."}
              </p>
            </div>
          </Button>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-border bg-muted/20">
        <div className="flex items-start gap-3">
          <Checkbox
            id="mobile-app-checkbox"
            checked={data.createMobileApp}
            onCheckedChange={(checked) => onChange({ createMobileApp: !!checked })}
            className="mt-1"
          />
          <div className="space-y-1">
            <Label htmlFor="mobile-app-checkbox" className="font-semibold text-sm cursor-pointer">
              {isAr ? "تجهيز تطبيق الموبايل (White-Label App)" : "Provision White-Label Mobile App"}
            </Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isAr
                ? "يقوم بإنشاء سجل تطبيق Expo مخصص مع الألوان والشعار المختارين في شاشة تطبيقات البراندات."
                : "Creates a dedicated Expo white-label app profile with your custom logo and palette."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
