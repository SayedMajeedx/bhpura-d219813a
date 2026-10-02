import { useState } from "react";
import { Gift, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstagramConnection } from "../hooks/use-instagram-connection";
import { GiveawayDetailView } from "./GiveawayDetailView";
import { GiveawayList } from "./GiveawayList";
import { InstagramConnectionCard } from "./InstagramConnectionCard";
import { NewGiveawayDialog } from "./NewGiveawayDialog";

/**
 * Instagram giveaways: connect the store's account, pick a post, pull its
 * comments, set the rules and draw. Following and liking cannot be read from
 * Instagram, so the winners are checked by hand.
 */
export function GiveawaysPageView() {
  const conn = useInstagramConnection();
  const { isAr } = conn;
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div
      className="mx-auto w-full min-w-0 max-w-3xl space-y-4 p-2 pb-32 sm:p-4 sm:pb-16"
      dir={isAr ? "rtl" : "ltr"}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Gift className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-lg font-bold text-foreground">
              {isAr ? "مسابقات انستغرام" : "Instagram giveaways"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "اسحب الفائزين من تعليقات أي بوست، مجاناً."
                : "Draw winners from the comments on any post, free."}
            </p>
          </div>
        </div>
        {!openId && conn.connected && (
          <Button type="button" size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
            <Plus className="size-4" />
            {isAr ? "مسابقة جديدة" : "New giveaway"}
          </Button>
        )}
      </header>

      <InstagramConnectionCard conn={conn} />

      {openId ? (
        <GiveawayDetailView giveawayId={openId} onBack={() => setOpenId(null)} />
      ) : (
        <GiveawayList isAr={isAr} onOpen={setOpenId} />
      )}

      <NewGiveawayDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        isAr={isAr}
        onCreated={setOpenId}
      />
    </div>
  );
}
