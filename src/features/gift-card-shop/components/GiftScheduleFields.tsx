import type { Dispatch, SetStateAction } from "react";
import { CalendarClock, Mail, MessageCircle, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SCHEDULE_MAX_DAYS,
  type GiftSchedule,
  type GiftSendChannel,
  type ScheduleProblem,
} from "@/lib/gift-schedule";
import { Choice } from "./BuyChoice";

/** A day as a date field writes it ("2026-12-12"), on the buyer's own clock. */
const dayValue = (at: Date) =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;

/**
 * When the gift reaches the person it is for (migration 20261230100000): now, by the buyer's own
 * link as before, or on a day and time the buyer picks, by email (the system sends the gift link
 * then) or by WhatsApp (a person at the store sends it then).
 */
export function GiftScheduleFields({
  schedule,
  setSchedule,
  problem,
  t,
}: {
  schedule: GiftSchedule;
  setSchedule: Dispatch<SetStateAction<GiftSchedule>>;
  /** What stops the schedule, once the buyer pressed to buy. */
  problem: ScheduleProblem | null;
  t: (ar: string, en: string) => string;
}) {
  const set = (patch: Partial<GiftSchedule>) =>
    setSchedule((current) => ({ ...current, ...patch }));
  const today = new Date();
  const last = new Date(today.getTime() + SCHEDULE_MAX_DAYS * 86_400_000);
  return (
    <div className="space-y-3">
      <p id="gift-when-label" className="text-sm font-medium">
        {t("متى تصل الهدية؟", "When should the gift arrive?")}
      </p>
      <div role="radiogroup" aria-labelledby="gift-when-label" className="grid grid-cols-2 gap-2">
        <Choice
          icon={Send}
          label={t("الآن، أرسلها بنفسي", "Now, I'll send it")}
          chosen={schedule.mode === "now"}
          onChoose={() => set({ mode: "now" })}
        />
        <Choice
          icon={CalendarClock}
          label={t("في يوم أختاره", "On a day I choose")}
          chosen={schedule.mode === "later"}
          onChoose={() => set({ mode: "later" })}
        />
      </div>

      {schedule.mode === "later" && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gift-send-date">{t("اليوم", "Day")}</Label>
              <Input
                id="gift-send-date"
                type="date"
                min={dayValue(today)}
                max={dayValue(last)}
                value={schedule.date}
                onChange={(e) => set({ date: e.target.value })}
                aria-invalid={problem === "when"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gift-send-time">{t("الساعة", "Time")}</Label>
              <Input
                id="gift-send-time"
                type="time"
                value={schedule.time}
                onChange={(e) => set({ time: e.target.value })}
                aria-invalid={problem === "when"}
              />
            </div>
          </div>
          {problem === "when" && (
            <p className="text-xs text-destructive">
              {t(
                "اختر يومًا وساعة بعد ربع ساعة على الأقل، وخلال سنة.",
                "Choose a day and time at least a quarter of an hour ahead, within a year.",
              )}
            </p>
          )}

          <p id="gift-send-by-label" className="text-sm font-medium">
            {t("تصلهم على", "It reaches them by")}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="gift-send-by-label"
            className="grid grid-cols-2 gap-2"
          >
            {(["email", "whatsapp"] as GiftSendChannel[]).map((channel) => (
              <Choice
                key={channel}
                icon={channel === "email" ? Mail : MessageCircle}
                label={channel === "email" ? t("البريد", "Email") : t("واتساب", "WhatsApp")}
                chosen={schedule.channel === channel}
                onChoose={() => set({ channel })}
                centred
              />
            ))}
          </div>
          {schedule.channel === "email" ? (
            <div className="space-y-1.5">
              <Label htmlFor="gift-recipient-email">{t("بريدهم", "Their email")}</Label>
              <Input
                id="gift-recipient-email"
                type="email"
                dir="ltr"
                value={schedule.email}
                onChange={(e) => set({ email: e.target.value })}
                maxLength={200}
                aria-invalid={problem === "email"}
              />
              {problem === "email" && (
                <p className="text-xs text-destructive">
                  {t("اكتب بريدهم كاملًا.", "Write their full email.")}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="gift-recipient-phone">
                {t("رقم واتساب الخاص بهم", "Their WhatsApp number")}
              </Label>
              <Input
                id="gift-recipient-phone"
                type="tel"
                dir="ltr"
                value={schedule.phone}
                onChange={(e) => set({ phone: e.target.value })}
                maxLength={32}
                aria-invalid={problem === "phone"}
              />
              {problem === "phone" && (
                <p className="text-xs text-destructive">
                  {t("اكتب رقمهم مع رمز الدولة.", "Write their number with its country code.")}
                </p>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {schedule.channel === "email"
              ? t(
                  "نرسل لهم رابط الهدية في موعدها، ونخبرك حين تصل. يبقى الرابط عندك أيضًا.",
                  "We send them the gift link at its time and tell you when it goes. You keep the link too.",
                )
              : t(
                  "يرسل لهم المتجر رابط الهدية على واتساب في موعدها. يبقى الرابط عندك أيضًا.",
                  "The store sends them the gift link on WhatsApp at its time. You keep the link too.",
                )}
          </p>
        </div>
      )}
    </div>
  );
}
