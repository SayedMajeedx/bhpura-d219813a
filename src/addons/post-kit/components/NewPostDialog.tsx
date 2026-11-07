import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { STARTERS, postFromStarter, type Starter } from "../content/starters";
import type { PostKit } from "../hooks/use-post-kit";
import { livePost } from "../lib/photos";
import { ownPostKey } from "../lib/own-posts";
import { PostPicture } from "./PostPicture";

/** The store's first piece on sale: what a new post with a photo starts on, changed in the maker. */
const firstPiece = (kit: PostKit) =>
  Object.entries(kit.photos).find(([, photo]) => !photo.upload)?.[0];

/** Choosing where a new post starts: each layout drawn as it will look, one tap to open it. */
export function NewPostDialog({
  open,
  onOpenChange,
  kit,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kit: PostKit;
  onCreated: (key: string) => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const piece = firstPiece(kit);
  const start = (starter: Starter) => {
    onCreated(kit.createPost(postFromStarter(starter, ownPostKey(), piece)));
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isAr ? "بوست جديد" : "New post"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? "اختار شكل البوست، وبعدها غيّر الكلام والصور والألوان."
              : "Choose a layout, then change its words, photos and colours."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {open
            ? STARTERS.map((starter) => {
                const preview = postFromStarter(starter, "starter", piece);
                const shown = kit.catalogue ? livePost(preview, kit.catalogue) : preview;
                const name = isAr ? starter.name.ar : starter.name.en;
                return (
                  <button
                    key={starter.id}
                    type="button"
                    onClick={() => start(starter)}
                    className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-2 text-start transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <PostPicture post={shown} kit={kit} label={name} />
                    <span className="text-xs font-medium text-foreground">{name}</span>
                  </button>
                );
              })
            : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
