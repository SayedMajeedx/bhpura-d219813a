import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ImagePlus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CropUploadButton } from "@/components/crop-upload-button";
import { cn } from "@/lib/utils";
import { uploadPublicMedia } from "@/lib/r2-upload";
import {
  deleteGalleryItem,
  invalidateStoreContent,
  reorderStoreContent,
  saveGalleryItem,
  storeContentQueries,
} from "@/lib/data/store-content";
import {
  EMPTY_GALLERY_FORM,
  bySortOrder,
  captionText,
  galleryColumns,
  galleryFormError,
  galleryFormFrom,
  moveItem,
  nextSortOrder,
  type GalleryForm,
} from "@/lib/store-content";

/** The store's pictures (past events, work): add with a crop, caption in both languages, order, hide. */
export function GalleryEditor({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const qc = useQueryClient();
  const items = [...(useQuery(storeContentQueries.gallery(brandId)).data ?? [])].sort(bySortOrder);
  const [editing, setEditing] = useState<{ id: string | null; form: GalleryForm } | null>(null);
  const [uploading, setUploading] = useState(false);

  const onError = (error: Error) => toast.error(error.message);
  const refresh = () => invalidateStoreContent(qc, brandId);
  const save = useMutation({
    mutationFn: ({ id, form }: { id: string | null; form: GalleryForm }) =>
      saveGalleryItem(brandId, id, galleryColumns(form), nextSortOrder(items)),
    onSuccess: async () => {
      await refresh();
      toast.success(isAr ? "تم الحفظ" : "Saved");
      setEditing(null);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteGalleryItem(brandId, id),
    onSuccess: refresh,
    onError,
  });
  const move = useMutation({
    mutationFn: (order: Array<{ id: string; sort_order: number }>) =>
      reorderStoreContent(brandId, "store_gallery_items", order),
    onSuccess: refresh,
    onError,
  });

  const upload = async (file: Blob) => {
    setUploading(true);
    try {
      const url = await uploadPublicMedia(brandId, file, "page");
      setEditing((current) => current && { ...current, form: { ...current.form, image_url: url } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : isAr ? "تعذّر الرفع" : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (editing) {
    const { form } = editing;
    const patch = (next: Partial<GalleryForm>) =>
      setEditing({ ...editing, form: { ...form, ...next } });
    const problem = galleryFormError(form, isAr);
    return (
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) save.mutate(editing);
        }}
      >
        <div className="flex items-center gap-3">
          {form.image_url ? (
            <img
              src={form.image_url}
              alt=""
              className="aspect-[4/3] w-40 rounded-xl border border-border object-cover"
            />
          ) : (
            <span className="grid aspect-[4/3] w-40 place-items-center rounded-xl border border-dashed border-border text-muted-foreground">
              <ImagePlus className="size-6" aria-hidden="true" />
            </span>
          )}
          <CropUploadButton
            onCrop={upload}
            preset="pageInline"
            busy={uploading}
            size="sm"
            title={isAr ? "ضبط الصورة" : "Frame the picture"}
          >
            {form.image_url
              ? isAr
                ? "تغيير الصورة"
                : "Change picture"
              : isAr
                ? "رفع صورة"
                : "Upload a picture"}
          </CropUploadButton>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gallery-caption-en">
              {isAr ? "التعليق بالإنجليزية" : "Caption (English)"}
            </Label>
            <Input
              id="gallery-caption-en"
              value={form.caption_en}
              maxLength={120}
              onChange={(event) => patch({ caption_en: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gallery-caption-ar">
              {isAr ? "التعليق بالعربية" : "Caption (Arabic)"}
            </Label>
            <Input
              id="gallery-caption-ar"
              dir="rtl"
              value={form.caption_ar}
              maxLength={120}
              onChange={(event) => patch({ caption_ar: event.target.value })}
            />
          </div>
        </div>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={form.is_active}
            onCheckedChange={(checked) => patch({ is_active: checked === true })}
          />
          {isAr ? "ظاهرة في المتجر" : "Shown on the store"}
        </Label>
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending || uploading || Boolean(problem)}>
            {isAr ? "حفظ" : "Save"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
            {isAr ? "رجوع" : "Back"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
          {isAr ? "لا توجد صور بعد." : "No pictures yet."}
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex gap-3 rounded-xl border border-border p-2",
              !item.is_active && "opacity-60",
            )}
          >
            <img
              src={item.image_url}
              alt={captionText(item, isAr)}
              className="aspect-[4/3] w-24 rounded-lg object-cover"
            />
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <p className="truncate text-sm text-foreground">
                {captionText(item, isAr) || (isAr ? "بدون تعليق" : "No caption")}
              </p>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={isAr ? "تحريك للأعلى" : "Move up"}
                  disabled={move.isPending}
                  onClick={() => {
                    const order = moveItem(items, item.id, -1);
                    if (order) move.mutate(order);
                  }}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={isAr ? "تحريك للأسفل" : "Move down"}
                  disabled={move.isPending}
                  onClick={() => {
                    const order = moveItem(items, item.id, 1);
                    if (order) move.mutate(order);
                  }}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={isAr ? "تعديل" : "Edit"}
                  onClick={() => setEditing({ id: item.id, form: galleryFormFrom(item) })}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive"
                  aria-label={isAr ? "حذف" : "Delete"}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(item.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        className="gap-1.5"
        onClick={() => setEditing({ id: null, form: EMPTY_GALLERY_FORM })}
      >
        <ImagePlus className="size-4" />
        {isAr ? "إضافة صورة" : "Add a picture"}
      </Button>
    </div>
  );
}
