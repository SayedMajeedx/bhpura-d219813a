/**
 * Names for the size guide studio's fields and icon buttons, for screen readers and voice
 * control: the fields showed only a placeholder (or a label that was not tied to them) and the
 * move and delete buttons only an arrow or a bin. Numbers count from 1, as the page shows them.
 */
export function studioNames(isAr: boolean) {
  const n = (i: number) => i + 1;
  return {
    nameAr: isAr ? "الاسم بالعربية" : "Name (Arabic)",
    nameEn: isAr ? "الاسم بالإنجليزية" : "Name (English)",
    columnLabelAr: (i: number) =>
      isAr ? `عنوان العمود ${n(i)} بالعربية` : `Column ${n(i)} label (Arabic)`,
    columnLabelEn: (i: number) =>
      isAr ? `عنوان العمود ${n(i)} بالإنجليزية` : `Column ${n(i)} label (English)`,
    columnKind: (i: number) => (isAr ? `نوع العمود ${n(i)}` : `Column ${n(i)} kind`),
    columnMeasure: (i: number) => (isAr ? `قياس العمود ${n(i)}` : `Column ${n(i)} measurement`),
    moveUp: (i: number) => (isAr ? `نقل العمود ${n(i)} للأعلى` : `Move column ${n(i)} up`),
    moveDown: (i: number) => (isAr ? `نقل العمود ${n(i)} للأسفل` : `Move column ${n(i)} down`),
    deleteColumn: (i: number) => (isAr ? `حذف العمود ${n(i)}` : `Delete column ${n(i)}`),
    rowSize: (i: number) => (isAr ? `المقاس في الصف ${n(i)}` : `Size in row ${n(i)}`),
    /** A measurement's cell: its column, then its size ("Bust · M"). */
    cell: (column: string, size: string) => `${column} · ${size}`,
    deleteStep: (i: number) => (isAr ? `حذف الخطوة ${n(i)}` : `Delete step ${n(i)}`),
    stepTitleAr: (i: number) =>
      isAr ? `عنوان الخطوة ${n(i)} بالعربية` : `Step ${n(i)} title (Arabic)`,
    stepTitleEn: (i: number) =>
      isAr ? `عنوان الخطوة ${n(i)} بالإنجليزية` : `Step ${n(i)} title (English)`,
    removePicture: isAr ? "إزالة الصورة" : "Remove the picture",
  };
}
