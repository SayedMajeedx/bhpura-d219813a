import type { CSSProperties } from "react";

/**
 * What the customer wrote for the workshop, on an invoice: under its own heading, each note as it
 * was written (its lines kept), so it never runs on beside the measurements.
 */
export function LineNotes({
  notes,
  lang,
  style = { opacity: 0.75 },
}: {
  notes: readonly string[];
  lang: "ar" | "en";
  style?: CSSProperties;
}) {
  if (notes.length === 0) return null;
  return (
    <div className="mt-1 text-xs" style={style}>
      <p className="font-medium">{lang === "ar" ? "ملاحظات للورشة" : "Notes for the workshop"}</p>
      {notes.map((note, i) => (
        <p key={i} dir="auto" className="whitespace-pre-line [overflow-wrap:anywhere]">
          {note}
        </p>
      ))}
    </div>
  );
}
