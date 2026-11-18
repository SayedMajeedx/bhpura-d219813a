/** Pictures pasted or dropped on the maker, and when a key belongs to a field being typed in. */

/** The pictures among pasted or dropped files, at most twelve as the upload button takes. */
export function imageFiles(files: ArrayLike<File> | null | undefined): File[] {
  return Array.from(files ?? [])
    .filter((file) => file.type.startsWith("image/"))
    .slice(0, 12);
}

/** Whether a key press is typing: Ctrl+Z there undoes the words, not the post. */
export function isTyping(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  return Boolean((target as Element).closest("input, textarea, select, [contenteditable='true']"));
}
