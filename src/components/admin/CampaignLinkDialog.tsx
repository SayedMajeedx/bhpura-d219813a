import { useId, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBrandOptional } from "@/lib/brand-context";
import { storefrontCanonical } from "@/lib/seo/canonical";
import { campaignLink, campaignWord, LINK_PLATFORMS, type LinkPlatform } from "@/lib/funnel";

const PLATFORM_WORDS: Record<LinkPlatform, [string, string]> = {
  instagram: ["انستقرام", "Instagram"],
  tiktok: ["تيك توك", "TikTok"],
  snapchat: ["سناب شات", "Snapchat"],
  whatsapp: ["واتساب", "WhatsApp"],
  facebook: ["فيسبوك", "Facebook"],
};

/**
 * A page's link tagged for one post (`campaignLink`): the platform it goes on and a word for the
 * post, so the dashboard's "Campaigns and posts" shows the visits and orders that post brought.
 * `path` is the page under the store ("" for its home page, `product/<id>` for a product).
 */
export function CampaignLinkDialog({
  open,
  onOpenChange,
  path = "",
  pageName,
  isAr,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path?: string;
  pageName?: string;
  isAr: boolean;
}) {
  const brand = useBrandOptional();
  const [platform, setPlatform] = useState<LinkPlatform>("instagram");
  const [campaign, setCampaign] = useState("");
  const [copied, setCopied] = useState(false);
  const fieldId = useId();
  if (!brand) return null;
  const link = campaignLink(storefrontCanonical(brand, path), platform, campaign);
  const word = campaignWord(campaign);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(isAr ? "تعذّر نسخ الرابط" : "Could not copy the link");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isAr ? "رابط لمنشور" : "Link for a post"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? "ضع هذا الرابط في البايو أو الستوري، وتظهر في لوحة التحكم الزيارات والطلبات التي جاءت منه."
              : "Put this link in your bio or story, and the dashboard shows the visits and orders the post brought."}
            {pageName ? ` · ${pageName}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{isAr ? "أين سيُنشر" : "Where it goes"}</legend>
            <div className="flex flex-wrap gap-2">
              {LINK_PLATFORMS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={platform === option ? "default" : "outline"}
                  aria-pressed={platform === option}
                  onClick={() => setPlatform(option)}
                >
                  {isAr ? PLATFORM_WORDS[option][0] : PLATFORM_WORDS[option][1]}
                </Button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-campaign`}>
              {isAr ? "اسم المنشور أو الحملة" : "The post's or campaign's name"}
            </Label>
            <Input
              id={`${fieldId}-campaign`}
              dir="ltr"
              value={campaign}
              placeholder="final-call"
              onChange={(event) => setCampaign(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {word
                ? isAr
                  ? `يظهر في لوحة التحكم باسم: ${word}`
                  : `Shows on the dashboard as: ${word}`
                : isAr
                  ? "بالإنجليزي: حروف وأرقام وشرطات، مثل final-call"
                  : "In English letters, digits and dashes, such as final-call"}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-link`}>{isAr ? "الرابط" : "The link"}</Label>
            <div className="flex gap-2">
              <Input
                id={`${fieldId}-link`}
                dir="ltr"
                readOnly
                value={link}
                onFocus={(event) => event.target.select()}
              />
              <Button type="button" onClick={copy} className="shrink-0 gap-1.5">
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                {copied ? (isAr ? "انتسخ" : "Copied") : isAr ? "نسخ" : "Copy"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A button that opens `CampaignLinkDialog` for the store's home page. */
export function CampaignLinkButton({ isAr }: { isAr: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <Link2 className="h-3.5 w-3.5" aria-hidden />
        {isAr ? "رابط لمنشور" : "Link for a post"}
      </Button>
      <CampaignLinkDialog open={open} onOpenChange={setOpen} isAr={isAr} />
    </>
  );
}
