import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBrand } from "@/lib/brand-context";
import {
  createGiveaway,
  GiveawayApiError,
  giveawaysQueries,
  invalidateGiveaways,
  type InstagramMedia,
} from "@/lib/data/giveaways";
import { DEFAULT_RULES } from "../lib/entry-rules";
import { giveawayErrorMessage } from "../lib/messages";

function postDate(iso: string | null, isAr: boolean) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(isAr ? "ar-BH-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Defaults the title to the start of the post's caption. */
function titleFor(media: InstagramMedia, isAr: boolean) {
  const first = media.caption?.split("\n")[0]?.trim() ?? "";
  if (first) return first.slice(0, 60);
  return isAr ? "مسابقة جديدة" : "New giveaway";
}

/** Picks one of the account's posts and starts a giveaway from it. */
export function NewGiveawayDialog({
  open,
  onOpenChange,
  isAr,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAr: boolean;
  onCreated: (id: string) => void;
}) {
  const brand = useBrand();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<InstagramMedia | null>(null);
  const [title, setTitle] = useState("");

  const media = useInfiniteQuery(giveawaysQueries.media(brand.id, open));
  const posts = media.data?.pages.flatMap((page) => page.media) ?? [];
  const loadError =
    media.error instanceof GiveawayApiError
      ? giveawayErrorMessage(media.error.code, isAr)
      : media.error
        ? giveawayErrorMessage(undefined, isAr)
        : null;

  const create = useMutation({
    mutationFn: () => {
      if (!picked) throw new Error("no post");
      return createGiveaway(brand.id, {
        title: title.trim() || titleFor(picked, isAr),
        media: picked,
        rules: DEFAULT_RULES,
      });
    },
    onSuccess: async (id) => {
      await invalidateGiveaways(qc, brand.id);
      setPicked(null);
      setTitle("");
      onOpenChange(false);
      onCreated(id);
    },
    onError: () => toast.error(isAr ? "تعذر إنشاء المسابقة." : "Could not create the giveaway."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        dir={isAr ? "rtl" : "ltr"}
      >
        <DialogHeader>
          <DialogTitle>{isAr ? "مسابقة جديدة" : "New giveaway"}</DialogTitle>
          <DialogDescription>
            {isAr ? "اختر البوست الذي تريد السحب من تعليقاته." : "Choose the post to draw from."}
          </DialogDescription>
        </DialogHeader>

        {media.isLoading && (
          <div className="flex h-32 items-center justify-center" role="status">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {loadError && (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        )}

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {posts.map((post) => {
            const selected = picked?.id === post.id;
            return (
              <li key={post.id}>
                <Button
                  type="button"
                  variant="ghost"
                  aria-pressed={selected}
                  onClick={() => {
                    setPicked(post);
                    setTitle(titleFor(post, isAr));
                  }}
                  className={`h-auto w-full flex-col items-stretch justify-start gap-0 overflow-hidden whitespace-normal rounded-xl border p-0 text-start font-normal transition ${
                    selected
                      ? "border-primary ring-2 ring-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <span className="block aspect-square bg-muted">
                    {post.thumbnail_url && (
                      <img
                        src={post.thumbnail_url}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    )}
                  </span>
                  <span className="flex items-center justify-between gap-2 p-2 text-xs text-muted-foreground">
                    <span>{postDate(post.posted_at, isAr)}</span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="size-3.5" aria-hidden="true" />
                      <span dir="ltr">{post.comments_count}</span>
                    </span>
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>

        {media.hasNextPage && (
          <Button
            type="button"
            variant="outline"
            disabled={media.isFetchingNextPage}
            onClick={() => void media.fetchNextPage()}
          >
            {media.isFetchingNextPage && <Loader2 className="size-4 animate-spin" />}
            {isAr ? "عرض المزيد" : "Show more"}
          </Button>
        )}

        {picked && (
          <div className="space-y-1.5">
            <Label htmlFor="giveaway-title">{isAr ? "اسم المسابقة" : "Giveaway name"}</Label>
            <Input
              id="giveaway-title"
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={!picked || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            {isAr ? "إنشاء" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
