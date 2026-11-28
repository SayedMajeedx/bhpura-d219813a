import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, CircleHelp, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";
import { useDisclosure } from "@/components/motion/use-disclosure";
import { systemSettingsQueries } from "@/lib/data/system-settings";
import {
  guideHref,
  helpGuides,
  supportChatUrl,
  supportMessage,
  type HelpGuide,
} from "@/lib/help/guides";
import { useProfile } from "@/lib/profile-context";
import { cn } from "@/lib/utils";

type Lang = "ar" | "en";

export type OsHelpContext = {
  lang: Lang;
  slug: string;
  storeName: string;
  /** The page the merchant is on, named in the chat's first message. */
  pageName?: string | null;
  services?: boolean;
};

/** The top bar's Help button, with its panel. */
export function OsHelpButton({ className, ...context }: OsHelpContext & { className?: string }) {
  const [open, setOpen] = React.useState(false);
  // The panel reads the person and Boutq's number only once someone asks for help.
  const [asked, setAsked] = React.useState(false);
  const label = context.lang === "ar" ? "مساعدة" : "Help";
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setAsked(true);
          setOpen(true);
        }}
        aria-label={label}
        title={label}
        className={cn(
          "h-8 gap-1.5 rounded-lg bg-background/60 px-2.5 text-xs font-semibold text-muted-foreground hover:bg-background hover:text-foreground",
          className,
        )}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden 2xl:inline">{label}</span>
      </Button>
      {asked && <OsHelpPanel open={open} onOpenChange={setOpen} {...context} />}
    </>
  );
}

/**
 * Help for the store's admin: five short guides that open where the job is done, and a WhatsApp
 * chat with Boutq that says which store and page it is about.
 */
export function OsHelpPanel({
  open,
  onOpenChange,
  lang,
  slug,
  storeName,
  pageName,
  services = false,
}: OsHelpContext & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const ar = lang === "ar";
  const navigate = useNavigate();
  const { profile } = useProfile();
  const support = useQuery({ ...systemSettingsQueries.supportNumber(), enabled: open });
  const guides = helpGuides(
    { role: profile?.role, status: profile?.status, permissions: profile?.permissions ?? [] },
    { services },
  );
  const chat = supportChatUrl(support.data, supportMessage({ storeName, pageName, lang }));
  const [openGuide, setOpenGuide] = React.useState<string | null>(null);

  const go = (guide: HelpGuide) => {
    onOpenChange(false);
    void navigate({ href: guideHref(guide, slug) });
  };

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} kind="details" size="md">
      <AppDialogHeader
        icon={<CircleHelp />}
        title={ar ? "مساعدة" : "Help"}
        description={
          ar
            ? "خطوات قصيرة لأهم ما تفعله في متجرك، وفريق Boutq على واتساب لأي سؤال."
            : "Short steps for the main jobs in your store, and the Boutq team on WhatsApp for anything else."
        }
      />
      <AppDialogBody className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground">
          {ar ? "أدلة سريعة" : "Quick guides"}
        </h3>
        <ul className="space-y-2">
          {guides.map((guide, index) => (
            <GuideRow
              key={guide.id}
              guide={guide}
              number={index + 1}
              lang={lang}
              open={openGuide === guide.id}
              onToggle={() => setOpenGuide((id) => (id === guide.id ? null : guide.id))}
              onGo={() => go(guide)}
            />
          ))}
        </ul>
      </AppDialogBody>
      <AppDialogFooter
        summary={ar ? "يرد عليك فريق Boutq على واتساب." : "The Boutq team answers you on WhatsApp."}
      >
        {chat ? (
          <Button asChild>
            <a href={chat} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4" aria-hidden />
              {ar ? "تحدّث مع Boutq" : "Chat with Boutq"}
            </a>
          </Button>
        ) : (
          <Button disabled>
            <MessageCircle className="h-4 w-4" aria-hidden />
            {ar ? "تحدّث مع Boutq" : "Chat with Boutq"}
          </Button>
        )}
      </AppDialogFooter>
    </AppDialog>
  );
}

function GuideRow({
  guide,
  number,
  lang,
  open,
  onToggle,
  onGo,
}: {
  guide: HelpGuide;
  number: number;
  lang: Lang;
  open: boolean;
  onToggle: () => void;
  onGo: () => void;
}) {
  const panelId = React.useId();
  const fold = useDisclosure(open);
  return (
    <li
      className="t-acc rounded-xl border border-border bg-card"
      data-open={fold.shown ? "true" : "false"}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="h-auto min-h-11 w-full justify-start gap-3 whitespace-normal rounded-xl px-3.5 py-2.5 text-start hover:bg-muted/40"
      >
        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-full bg-muted font-mono text-xs font-semibold text-muted-foreground"
        >
          {number}
        </span>
        <span className="min-w-0 flex-1 break-words text-sm font-semibold text-foreground">
          {guide.title[lang]}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-quick)",
            open && "rotate-180",
          )}
        />
      </Button>
      {fold.mounted && (
        <div id={panelId} className="t-acc-panel">
          <div className="t-acc-panel-inner">
            <div className="space-y-3 px-3.5 pb-3.5">
              <ol className="list-decimal space-y-1.5 ps-5 text-sm text-foreground marker:text-muted-foreground">
                {guide.steps.map((step) => (
                  <li key={step.en} className="break-words">
                    {step[lang]}
                  </li>
                ))}
              </ol>
              <Button type="button" variant="outline" size="sm" onClick={onGo}>
                {guide.open[lang]}
              </Button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
