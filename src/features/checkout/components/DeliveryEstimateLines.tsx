import type { EstimateLine } from "@/lib/delivery-estimate";

/**
 * The delivery estimate: one sentence, or one line per kind of piece when the cart holds both
 * ready and made-to-order pieces (each line says which pieces it is about).
 */
export function DeliveryEstimateLines({ lines }: { lines: EstimateLine[] }) {
  if (lines.length === 1) return <>{lines[0].text}</>;
  return (
    <span className="block space-y-0.5">
      {lines.map((line) => (
        <span key={line.kind} className="block">
          {line.label ? <span className="font-semibold">{line.label}: </span> : null}
          {line.text}
        </span>
      ))}
    </span>
  );
}
