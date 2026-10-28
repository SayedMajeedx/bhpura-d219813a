import { useId, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseVerificationInput, SEARCH_CONSOLE_URL } from "@/lib/seo/search-console";

const TAG_EXAMPLE = '<meta name="google-site-verification" content="…" />';

function ConsoleLink() {
  return (
    <a
      href={SEARCH_CONSOLE_URL}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-primary underline"
    >
      Search Console <ExternalLink className="size-3" aria-hidden="true" />
    </a>
  );
}

/**
 * Google Search Console: the code that proves the store is its owner's (a merchant pastes the tag
 * Google shows or just its code; the storefront writes the tag), and the sitemap to submit once it
 * is verified.
 */
export function SearchConsoleCard({
  isAr,
  token,
  sitemapUrl,
  onToken,
}: {
  isAr: boolean;
  token: string | null | undefined;
  sitemapUrl: string;
  onToken: (token: string | null) => void;
}) {
  const id = useId();
  const [text, setText] = useState(token ?? "");
  const parsed = parseVerificationInput(text);

  const change = (value: string) => {
    setText(value);
    const next = parseVerificationInput(value);
    if (next.status === "empty") onToken(null);
    else if (next.status === "ok") onToken(next.token);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sitemapUrl);
      toast.success(isAr ? "تم نسخ الرابط" : "Link copied");
    } catch {
      toast.error(
        isAr ? "تعذّر النسخ، انسخ الرابط يدويًا" : "Could not copy: copy the link by hand",
      );
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Google Search Console</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAr
            ? "اربط متجرك بـ Search Console لتعرف ما يبحث عنه الناس قبل أن يصلوا إليك، ولترسل لـ Google خريطة موقعك."
            : "Connect your store to Search Console to see what people search before they reach you, and to send Google your sitemap."}
        </p>
      </div>

      <ol className="list-decimal space-y-1 ps-5 text-xs text-muted-foreground">
        <li>
          {isAr ? (
            <>
              افتح <ConsoleLink /> وأضف موقعك كـ «بادئة عنوان URL» بالرابط الرئيسي لمتجرك.
            </>
          ) : (
            <>
              Open <ConsoleLink /> and add your site as a “URL prefix” with your store’s main
              address.
            </>
          )}
        </li>
        <li>
          {isAr
            ? "اختر التحقق بوسم HTML، وانسخ الوسم الذي يعرضه (أو الرمز وحده) والصقه هنا ثم احفظ."
            : "Choose the HTML tag method, copy the tag it shows (or just its code), paste it here and save."}
        </li>
        <li>
          {isAr
            ? "ارجع إلى Search Console واضغط «تحقق»، ثم أرسل خريطة الموقع أدناه من قسم Sitemaps."
            : "Go back to Search Console and press “Verify”, then submit the sitemap below under Sitemaps."}
        </li>
      </ol>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-token`} className="text-xs font-medium">
          {isAr ? "وسم التحقق أو رمزه" : "Verification tag or its code"}
        </Label>
        <Input
          id={`${id}-token`}
          dir="ltr"
          value={text}
          onChange={(event) => change(event.target.value)}
          onBlur={() => parsed.status === "ok" && setText(parsed.token)}
          placeholder={TAG_EXAMPLE}
          aria-invalid={parsed.status === "invalid"}
          className="h-9 font-mono text-xs"
        />
        {parsed.status === "invalid" && (
          <p className="text-xs text-destructive">
            {isAr
              ? "هذا ليس وسمًا ولا رمزًا صالحًا: الرمز حروف وأرقام وشرطات فقط. لن يُحفظ."
              : "That is not a valid tag or code: a code is letters, digits and dashes only. It will not be saved."}
          </p>
        )}
        {parsed.status === "ok" && (
          <p className="text-xs text-success">
            {isAr
              ? "سيُضاف الوسم إلى متجرك عند الحفظ."
              : "The tag is added to your store when you save."}
          </p>
        )}
      </div>

      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${id}-sitemap`} className="text-xs font-medium">
          {isAr ? "رابط خريطة الموقع" : "Sitemap link"}
        </Label>
        <div className="flex min-w-0 gap-2">
          <Input
            id={`${id}-sitemap`}
            dir="ltr"
            readOnly
            value={sitemapUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={copy}
            aria-label={isAr ? "نسخ رابط خريطة الموقع" : "Copy the sitemap link"}
          >
            <Copy className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "تضم صفحاتك بالعربية والإنجليزية، وتتحدّث وحدها."
            : "It lists your pages in Arabic and English, and keeps itself up to date."}
        </p>
      </div>
    </section>
  );
}
