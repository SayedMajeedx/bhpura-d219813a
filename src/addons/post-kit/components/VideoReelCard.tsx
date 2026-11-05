import { Clapperboard, Copy, Pencil, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/lib/i18n";
import type { PostKit } from "../hooks/use-post-kit";
import { useReelExport } from "../hooks/use-reel-export";
import { asReelFrame, reelDuration, type VideoReel } from "../lib/reels";
import { copyWords } from "./PostKitPage";
import { PostPicture } from "./PostPicture";

/** A reel with no filming: its frames as the store left them, and a video made from them. */
export function VideoReelCard({
  reel,
  kit,
  onEdit,
}: {
  reel: VideoReel;
  kit: PostKit;
  onEdit: (postKey: string) => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const video = useReelExport(reel, kit);
  const seconds = reelDuration(reel);
  const caption = kit.currentOf(reel.frames[0].post).caption;
  const working = video.progress !== null;

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4">
      <h3 className="text-sm font-semibold text-foreground" dir="rtl">
        {reel.title}
      </h3>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? `${seconds} ثواني، بدون تصوير. الفيديو ياخذ كلام الإطارات وصورها مثل ما عدلتها.`
          : `${seconds} seconds, no filming. The video takes the frames' words and photos as you left them.`}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {reel.frames.map((frame, index) => {
          const post = kit.currentOf(frame.post);
          return (
            <div key={frame.post} className="flex min-w-0 flex-col gap-2">
              <PostPicture post={asReelFrame(post)} kit={kit} label={post.title} />
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? `الإطار ${index + 1}: ${frame.seconds} ثواني`
                  : `Frame ${index + 1}: ${frame.seconds} seconds`}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={working}
                aria-label={`${isAr ? "عدّل" : "Edit"} ${post.title}`}
                onClick={() => onEdit(frame.post)}
              >
                <Pencil className="size-4" />
                {isAr ? "عدّل" : "Edit"}
              </Button>
            </div>
          );
        })}
      </div>
      {caption ? (
        <p
          dir="rtl"
          className="whitespace-pre-line break-words text-xs leading-relaxed text-muted-foreground"
        >
          {caption}
        </p>
      ) : null}

      {working ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span role="status">
              {isAr
                ? `جاري تجهيز الفيديو ${video.progress}%`
                : `Making the video ${video.progress}%`}
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={video.cancel}>
              <X className="size-4" />
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
          </div>
          <Progress
            value={video.progress}
            aria-label={isAr ? "تجهيز الفيديو" : "Making the video"}
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {video.ready ? (
            <Button type="button" size="sm" onClick={video.share}>
              <Share2 className="size-4" />
              {isAr ? "شارك الفيديو أو احفظه" : "Share or save the video"}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={video.supported !== true}
              onClick={() => void video.start()}
            >
              <Clapperboard className="size-4" />
              {isAr ? "جهّز الفيديو" : "Make the video"}
            </Button>
          )}
          {caption ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copyWords(caption, isAr)}
            >
              <Copy className="size-4" />
              {isAr ? "انسخ الكابشن" : "Copy the caption"}
            </Button>
          ) : null}
        </div>
      )}

      {video.supported === false ? (
        <p role="note" className="text-xs text-muted-foreground">
          {isAr
            ? "هالمتصفح ما يقدر يجهز فيديو. جرّب Chrome أو Safari محدث، أو احفظ الإطارات صور من البوستات وسو منها ريل في انستجرام."
            : "This browser cannot make a video. Try an up-to-date Chrome or Safari, or save the frames from Posts and build the reel in Instagram."}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "الفيديو بدون صوت: أضف صوت ترند من انستجرام."
            : "The video has no sound: add a trending one in Instagram."}
        </p>
      )}
    </Card>
  );
}
