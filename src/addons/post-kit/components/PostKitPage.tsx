import { useEffect, useState } from "react";
import { Link, Navigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  CopyPlus,
  Download,
  Pencil,
  Plus,
  Sticker,
} from "lucide-react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAddons } from "@/components/addons/AddonsProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isInstalled } from "@/lib/addons/addon-registry";
import { deliverCreativeFile } from "@/lib/creative-export";
import { useI18n } from "@/lib/i18n";
import { POSTS } from "../content/posts";
import { REELS, VIDEO_REELS } from "../content/plan";
import { usePostKit, type PostKit } from "../hooks/use-post-kit";
import { pieceOnSale } from "../lib/own-posts";
import { renderPost } from "../lib/render";
import type { Post } from "../lib/types";
import { NewPostDialog } from "./NewPostDialog";
import { PostCalendar } from "./PostCalendar";
import { PostMaker } from "./PostMaker";
import { PostPicture } from "./PostPicture";
import { StickersTab } from "./StickersTab";
import { VideoReelCard } from "./VideoReelCard";

export async function savePost(post: Post, kit: PostKit, isAr: boolean) {
  const canvas = document.createElement("canvas");
  renderPost(canvas, post, kit.photos, 1);
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, "image/png");
    } catch {
      resolve(null);
    }
  });
  if (!blob) {
    toast.error(isAr ? "ما قدرنا نجهز الصورة" : "Could not prepare the image");
    return;
  }
  const name = `${kit.brand.slug}-${post.key}.png`;
  const delivered = await deliverCreativeFile(blob, name, "image/png", post.title);
  if (delivered !== "cancelled") {
    toast.success(isAr ? "الصورة جاهزة" : "Image ready");
  }
}

export async function copyWords(text: string, isAr: boolean) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(isAr ? "انتسخ" : "Copied");
  } catch {
    toast.error(isAr ? "ما قدرنا ننسخ، انسخه يدوي" : "Could not copy, select the text instead");
  }
}

function PostCard({
  postKey,
  kit,
  onEdit,
  onCopied,
}: {
  postKey: string;
  kit: PostKit;
  onEdit: () => void;
  onCopied: (key: string) => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const post = kit.currentOf(postKey);
  return (
    <Card className="flex min-w-0 flex-col gap-2 p-3">
      <PostPicture post={post} kit={kit} label={post.title} />
      <p className="text-xs font-medium text-muted-foreground">{post.series}</p>
      <h3 className="text-sm font-semibold text-foreground">{post.title}</h3>
      {post.caption ? (
        <p
          dir="rtl"
          className="whitespace-pre-line break-words text-xs leading-relaxed text-muted-foreground"
        >
          {post.caption}
        </p>
      ) : null}
      {post.note ? (
        <p dir="rtl" className="text-xs leading-relaxed text-foreground">
          {post.note}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Button type="button" size="sm" onClick={onEdit}>
          <Pencil className="size-4" />
          {isAr ? "عدّل" : "Edit"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void savePost(post, kit, isAr)}
        >
          <Download className="size-4" />
          {isAr ? "حمّل" : "Save"}
        </Button>
        {post.caption ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`${isAr ? "انسخ كابشن" : "Copy the caption of"} ${post.title}`}
            onClick={() => void copyWords(post.caption, isAr)}
          >
            <Copy className="size-4" />
            {isAr ? "الكابشن" : "Caption"}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`${isAr ? "انسخ بوست" : "Copy the post"} ${post.title}`}
          onClick={() => {
            const key = kit.copyPost(post);
            if (key) onCopied(key);
          }}
        >
          <CopyPlus className="size-4" />
          {isAr ? "نسخة" : "Copy"}
        </Button>
      </div>
    </Card>
  );
}

function ReelsList({ isAr }: { isAr: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {REELS.map((reel) => (
        <Card key={reel.title} className="flex min-w-0 flex-col gap-2 p-4" dir="rtl">
          <h3 className="text-sm font-semibold text-foreground">{reel.title}</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">{reel.shots}</p>
          <p className="whitespace-pre-line text-xs leading-relaxed text-foreground">
            {reel.overlay}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">{reel.audio}</p>
          <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
            {reel.caption}
          </p>
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copyWords(reel.overlay, isAr)}
            >
              {isAr ? "انسخ الكلام" : "Copy the words"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copyWords(reel.caption, isAr)}
            >
              {isAr ? "انسخ الكابشن" : "Copy the caption"}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

/** A heading and a grid of posts, or nothing while it holds none. */
function PostGrid({
  title,
  keys,
  kit,
  open,
}: {
  title: string;
  keys: string[];
  kit: PostKit;
  open: (key: string) => void;
}) {
  if (!keys.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-4">
        {keys.map((key) => (
          <PostCard key={key} postKey={key} kit={kit} onEdit={() => open(key)} onCopied={open} />
        ))}
      </div>
    </section>
  );
}

function PostKitBody() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const kit = usePostKit();
  const [editing, setEditing] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const Back = isAr ? ArrowRight : ArrowLeft;
  const open = (key: string) => {
    setEditing(key);
    window.scrollTo({ top: 0 });
  };

  // Said from here, not only in the maker: on a phone its heading has scrolled away, and a change
  // can still fail after the merchant left the post.
  const { saveState, retrySave } = kit;
  useEffect(() => {
    if (saveState === "saved") toast.dismiss("post-kit-save");
    if (saveState !== "failed") return;
    toast.error(
      isAr
        ? "ما انحفظ في المتجر، بس محفوظ في هالجهاز."
        : "Not saved to the store yet, but kept on this device.",
      {
        id: "post-kit-save",
        action: {
          label: isAr ? "حاول مرة ثانية" : "Try again",
          onClick: () => void retrySave(),
        },
      },
    );
  }, [saveState, retrySave, isAr]);

  if (kit.failed) {
    return (
      <p className="p-6 text-sm text-destructive">
        {isAr
          ? "ما قدرنا نقرا المنتجات والبوستات. جرّب مرة ثانية."
          : "Could not read the products and posts. Try again."}
      </p>
    );
  }
  if (!kit.ready) return <SectionSkeleton rows={4} />;
  // A post deleted on another device leaves nothing to edit: back to the list, never a blank maker.
  if (editing && kit.currentOf(editing)) {
    return (
      <PostMaker
        key={editing}
        postKey={editing}
        kit={kit}
        onClose={() => setEditing(null)}
        onOpenCopy={open}
      />
    );
  }
  const onSale = POSTS.filter((post) => pieceOnSale(post, kit.photos));
  const keysOf = (tpl: string) => onSale.filter((post) => post.tpl === tpl).map((post) => post.key);
  const rest = onSale
    .filter((post) => post.tpl !== "piece" && post.tpl !== "paper")
    .map((post) => post.key);
  return (
    <div className="space-y-4">
      <AdminPageHeader
        icon={Sticker}
        title={isAr ? "عدّة البوستات" : "Post kit"}
        description={
          isAr
            ? "بوستات جاهزة بصوركم وأسعاركم. عدّلها وحمّلها وانشرها."
            : "Ready posts with your photos and prices. Edit, save and publish them."
        }
        actions={
          <>
            <Button type="button" size="sm" onClick={() => setStarting(true)}>
              <Plus className="size-4" />
              {isAr ? "بوست جديد" : "New post"}
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/b/$slug/content-studio" params={{ slug: kit.brand.slug }}>
                <Back className="size-4" />
                {isAr ? "الاستوديو" : "Studio"}
              </Link>
            </Button>
          </>
        }
      />
      <NewPostDialog open={starting} onOpenChange={setStarting} kit={kit} onCreated={open} />
      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="posts">{isAr ? "البوستات" : "Posts"}</TabsTrigger>
          <TabsTrigger value="reels">{isAr ? "الريلز" : "Reels"}</TabsTrigger>
          <TabsTrigger value="stickers">{isAr ? "ملصقات للطباعة" : "Print stickers"}</TabsTrigger>
          <TabsTrigger value="plan">{isAr ? "خطة النشر" : "Plan"}</TabsTrigger>
        </TabsList>
        <TabsContent value="posts" className="space-y-6">
          <PostGrid
            title={isAr ? "بوستاتكم" : "Your posts"}
            keys={kit.ownKeys}
            kit={kit}
            open={open}
          />
          <PostGrid
            title={isAr ? "البوستات الجاهزة" : "Ready posts"}
            keys={rest}
            kit={kit}
            open={open}
          />
          <PostGrid
            title={isAr ? "أوراق شمّوعة" : "Shammoua's papers"}
            keys={keysOf("paper")}
            kit={kit}
            open={open}
          />
          <PostGrid
            title={isAr ? "كروت القطع" : "Piece cards"}
            keys={keysOf("piece")}
            kit={kit}
            open={open}
          />
        </TabsContent>
        <TabsContent value="reels" className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              {isAr ? "جاهزة بدون تصوير" : "Ready, no filming"}
            </h2>
            <div className="grid max-w-3xl gap-4">
              {VIDEO_REELS.map((reel) => (
                <VideoReelCard key={reel.key} reel={reel} kit={kit} onEdit={open} />
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              {isAr ? "تصورونها بنفسكم" : "To shoot yourselves"}
            </h2>
            <ReelsList isAr={isAr} />
          </section>
        </TabsContent>
        <TabsContent value="stickers">
          <StickersTab kit={kit} />
        </TabsContent>
        <TabsContent value="plan">
          <PostCalendar kit={kit} onOpen={open} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** The page. A store without the add-on, opening the address by hand, goes back to the studio. */
export default function PostKitPage({ slug }: { slug: string }) {
  const { addons, isLoading } = useAddons();
  if (isLoading) return <SectionSkeleton rows={4} />;
  if (!isInstalled(addons, "post-kit")) {
    return <Navigate to="/admin/b/$slug/content-studio" params={{ slug }} replace />;
  }
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1500px] p-2 pb-32 sm:p-4 sm:pb-16">
      <PostKitBody />
    </div>
  );
}
