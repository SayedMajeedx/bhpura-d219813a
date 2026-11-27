import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, MessageCircle, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loyaltyQueries } from "@/lib/data/loyalty";
import { countOf } from "@/lib/arabic-count";
import { inviteMessage, referralLink } from "@/lib/referral-link";

/**
 * The member's invitation on their Rewards tab (migration 20261228100000): their own link, a way
 * to copy it or send it on WhatsApp (a person sends it), what each side gets and how many friends
 * came. Drawn only while the store gives points for a referral.
 */
export function ReferralInviteCard({
  brandId,
  customerId,
  slug,
  storeName,
  lang,
}: {
  brandId: string;
  customerId: string;
  slug: string;
  storeName: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const { data: referral } = useQuery(loyaltyQueries.myReferral(brandId, customerId));
  const [copied, setCopied] = useState(false);
  if (!referral) return null;

  const link = referralLink(slug, referral.code);
  const share = `https://wa.me/?text=${encodeURIComponent(
    inviteMessage(link, storeName, referral.points, lang),
  )}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserPlus className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="font-semibold">{isAr ? "دعوة صديق" : "Invite a friend"}</h3>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? `عند إكمال صديق أول طلب من رابطك، لكلٍّ منكما ${countOf(referral.points, "point", "ar")}.`
              : `When a friend completes their first order through your link, you each get ${countOf(referral.points, "point", "en")}.`}
          </p>
        </div>
      </div>
      <p
        className="break-all rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
        dir="ltr"
      >
        {link}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={copy} className="gap-2">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? (isAr ? "تم النسخ" : "Copied") : isAr ? "نسخ الرابط" : "Copy link"}
        </Button>
        <Button asChild className="gap-2">
          <a href={share} target="_blank" rel="noreferrer">
            <MessageCircle className="size-4" />
            {isAr ? "إرسال عبر واتساب" : "Send on WhatsApp"}
          </a>
        </Button>
      </div>
      {referral.friends > 0 && (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? `بدعوتك: ${countOf(referral.friends, "customer", "ar")}${referral.rewarded > 0 ? `، ومنهم ${countOf(referral.rewarded, "customer", "ar")} بطلب مكتمل` : ""}.`
            : `Through your link: ${countOf(referral.friends, "customer", "en")}${referral.rewarded > 0 ? `, ${referral.rewarded} with a completed order` : ""}.`}
        </p>
      )}
    </Card>
  );
}
