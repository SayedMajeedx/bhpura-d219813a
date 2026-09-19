import * as React from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Phone, Globe, ExternalLink, Share2 } from "lucide-react";
import { PhoneInput } from "@/components/phone-input";
import { useBrandSettingsFormContext } from "../../use-brand-settings-form";
import { useI18n } from "@/lib/i18n";
import { Link } from "@tanstack/react-router";

export function ContactGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { bs, brand, setBs } = useBrandSettingsFormContext();

  return (
    <Card className="p-6 rounded-2xl border-border bg-card space-y-6">
      <div className="flex items-center gap-2">
        <Phone className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-display text-lg font-semibold">
            {isAr ? "معلومات التواصل والعنوان" : "Contact & Location Info"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "بيانات الاتصال المباشر مع العملاء وعنوان المقر الرئيسي"
              : "Direct customer communication channels and primary store address"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone">{isAr ? "رقم الهاتف الرئيسي" : "Primary Phone"}</Label>
          <PhoneInput
            value={bs.phone ?? ""}
            onChange={(v) => setBs("phone", v)}
          />
        </div>

        {/* WhatsApp Number (Single source of truth) */}
        <div className="space-y-2">
          <Label htmlFor="whatsapp_number">{isAr ? "رقم واتساب المعتمد" : "WhatsApp Number"}</Label>
          <PhoneInput
            value={bs.whatsapp_number ?? ""}
            onChange={(v) => setBs("whatsapp_number", v)}
          />
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "يُستخدم في مراسلات العملاء والزر العائم في المتجر."
              : "Used for direct customer chats and the storefront floating button."}
          </p>
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">{isAr ? "البريد الإلكتروني للنشاط" : "Business Email"}</Label>
          <Input
            id="email"
            type="email"
            dir="ltr"
            value={bs.email ?? ""}
            onChange={(e) => setBs("email", e.target.value)}
            placeholder="info@yourbrand.com"
          />
        </div>

        {/* Custom Domain (Read only) */}
        <div className="space-y-2">
          <Label htmlFor="custom_domain">{isAr ? "النطاق المخصص (Domain)" : "Custom Domain"}</Label>
          <div className="flex gap-2">
            <Input
              id="custom_domain"
              dir="ltr"
              value={brand.custom_domain ?? ""}
              readOnly
              disabled
              placeholder={isAr ? "لم يتم ربط نطاق مخصص بعد" : "No custom domain connected"}
              className="bg-muted text-muted-foreground cursor-not-allowed"
            />
            {brand.custom_domain && (
              <Button variant="outline" size="icon" asChild>
                <a
                  href={`https://${brand.custom_domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={isAr ? "فتح النطاق" : "Open domain"}
                >
                  <Globe className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "لربط أو ترقية نطاق متجرك الخاص (.com)، يرجى التواصل مع الدعم الفني."
              : "To connect your custom domain (.com), contact platform support."}
          </p>
        </div>
      </div>

      {/* Address */}
      <div className="space-y-2">
        <Label htmlFor="address">{isAr ? "العنوان والمقر" : "Physical Address"}</Label>
        <Textarea
          id="address"
          value={bs.address ?? ""}
          onChange={(e) => setBs("address", e.target.value)}
          placeholder={isAr ? "المملكة، المدينة، الشارع، المبنى..." : "Country, City, Street, Building..."}
          rows={2}
        />
      </div>

      {/* Social Links Link */}
      <div className="flex items-center justify-between rounded-xl border border-border p-4 bg-muted/10">
        <div className="flex items-center gap-3">
          <Share2 className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">
              {isAr ? "روابط شبكات التواصل الاجتماعي" : "Social Media Profiles"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "إنستغرام، تيك توك، تويتر/إكس وغيرها تُدار من شاشة الصفحات وروابط التواصل"
                : "Instagram, TikTok, X, and others are managed in Pages & Socials"}
            </p>
          </div>
        </div>
        {brand.slug && (
          <Button variant="outline" size="sm" asChild>
            <Link
              to="/admin/b/$slug/pages"
              params={{ slug: brand.slug }}
              search={{ scope: "socials" } as any}
            >
              <span>{isAr ? "إدارة الروابط" : "Manage Socials"}</span>
              <ExternalLink className="ms-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}
