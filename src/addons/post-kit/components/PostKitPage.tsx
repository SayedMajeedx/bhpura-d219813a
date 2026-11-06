import { useEffect, useState } from "react";
import { Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Copy, Download, Pencil, Sticker } from "lucide-react";
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
import { PLAN, REELS, VIDEO_REELS } from "../content/plan";
import { usePostKit, type PostKit } from "../hooks/use-post-kit";
import { renderPost } from "../lib/render";
import type { Post } from "../lib/types";
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

function PostCard({ postKey, kit, onEdit }: { postKey: string; kit: PostKit; onEdit: () => void }) {
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

function PlanTable({ isAr }: { isAr: boolean }) {
  return (
    <Card className="overflow-x-auto p-0" dir="rtl">
      <table className="w-full min-w-[560px] text-start text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="p-3 text-start font-medium">
              {isAr ? "اليوم" : "Day"}
            </th>
            <th scope="col" className="p-3 text-start font-medium">
              {isAr ? "النوع" : "Kind"}
            </th>
            <th scope="col" className="p-3 text-start font-medium">
              {isAr ? "البوست" : "Post"}
            </th>
          </tr>
        </thead>
        <tbody>
          {PLAN.flatMap((week) => week.rows).map(([day, kind, what]) => (
            <tr key={`${day}-${what}`} className="border-b border-border last:border-0">
              <td className="p-3 font-medium text-foreground">{day}</td>
              <td className="p-3 text-muted-foreground">{kind}</td>
              <td className="p-3 text-foreground">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function PostKitBody() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const kit = usePostKit();
  const [editing, setEditing] = useState<string | null>(null);
  const Back = isAr ? ArrowRight : ArrowLeft;

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
  if (editing) {
    return <PostMaker key={editing} postKey={editing} kit={kit} onClose={() => setEditing(null)} />;
  }
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
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/b/$slug/content-studio" params={{ slug: kit.brand.slug }}>
              <Back className="size-4" />
              {isAr ? "الاستوديو" : "Studio"}
            </Link>
          </Button>
        }
      />
      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="posts">{isAr ? "البوستات" : "Posts"}</TabsTrigger>
          <TabsTrigger value="reels">{isAr ? "الريلز" : "Reels"}</TabsTrigger>
          <TabsTrigger value="stickers">{isAr ? "ملصقات للطباعة" : "Print stickers"}</TabsTrigger>
          <TabsTrigger value="plan">{isAr ? "خطة النشر" : "Plan"}</TabsTrigger>
        </TabsList>
        <TabsContent value="posts">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-4">
            {POSTS.map((post) => (
              <PostCard
                key={post.key}
                postKey={post.key}
                kit={kit}
                onEdit={() => {
                  setEditing(post.key);
                  window.scrollTo({ top: 0 });
                }}
              />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="reels" className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              {isAr ? "جاهزة بدون تصوير" : "Ready, no filming"}
            </h2>
            <div className="grid max-w-3xl gap-4">
              {VIDEO_REELS.map((reel) => (
                <VideoReelCard
                  key={reel.key}
                  reel={reel}
                  kit={kit}
                  onEdit={(postKey) => {
                    setEditing(postKey);
                    window.scrollTo({ top: 0 });
                  }}
                />
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
          <PlanTable isAr={isAr} />
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
