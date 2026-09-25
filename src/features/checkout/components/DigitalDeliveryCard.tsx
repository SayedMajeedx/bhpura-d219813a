import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, MessageCircle } from "lucide-react";
import type { Storefront } from "@/features/checkout/types";
import type { usePickupAndDigital } from "@/features/checkout/hooks/use-pickup-and-digital";

/** Where to send a digital order: email or WhatsApp, and the address or number. */
export function DigitalDeliveryCard({
  digitalChannel,
  digitalContact,
  setDigitalChannel,
  setDigitalContact,
  t,
}: {
  digitalChannel: ReturnType<typeof usePickupAndDigital>["digitalChannel"];
  digitalContact: ReturnType<typeof usePickupAndDigital>["digitalContact"];
  setDigitalChannel: ReturnType<typeof usePickupAndDigital>["setDigitalChannel"];
  setDigitalContact: ReturnType<typeof usePickupAndDigital>["setDigitalContact"];
  t: Storefront["t"];
}) {
  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-display text-xl">
          {t("طريقة استلام المنتج الرقمي", "Digital delivery channel")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "اختر طريقة واحدة وأدخل بيانات الاستلام المطلوبة.",
            "Choose one channel and enter the required delivery contact.",
          )}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["email", t("البريد الإلكتروني", "Email"), Mail],
            ["whatsapp", t("واتساب", "WhatsApp"), MessageCircle],
          ] as const
        ).map(([channel, label, Icon]) => (
          <Button
            key={channel}
            type="button"
            variant={digitalChannel === channel ? "outline" : "ghost"}
            onClick={() => {
              setDigitalChannel(channel);
              setDigitalContact("");
            }}
            className={`flex items-center gap-2 rounded-lg border p-3 h-auto justify-start ${
              digitalChannel === channel ? "border-primary bg-primary/10" : "border-border"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </Button>
        ))}
      </div>
      <div>
        <Label htmlFor="digital-delivery-contact">
          {digitalChannel === "email"
            ? t("البريد الإلكتروني", "Email address")
            : t("رقم أو معرّف واتساب", "WhatsApp number or user ID")}
          <span className="text-destructive font-bold ms-1" aria-hidden="true">
            *
          </span>
        </Label>
        <Input
          id="digital-delivery-contact"
          name="digital-delivery-contact"
          required
          className="h-11"
          type={digitalChannel === "email" ? "email" : "text"}
          inputMode={digitalChannel === "email" ? "email" : "text"}
          autoComplete={digitalChannel === "email" ? "email" : "tel"}
          value={digitalContact}
          onChange={(e) => setDigitalContact(e.target.value)}
          placeholder={
            digitalChannel === "email"
              ? "name@example.com"
              : t("مثال: +973… أو معرّف المستخدم", "e.g. +973… or user ID")
          }
        />
      </div>
    </Card>
  );
}
