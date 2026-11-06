/**
 * An abaya laid flat with each measurement marked on it, in the reader's language. Its colours are
 * the page's own tokens, so it wears the store's colour, and it stays sharp at any width. The
 * labels are centred, so the drawing reads the same on an Arabic page and an English one.
 */

type Point = readonly [number, number];

const GARMENT =
  "M205 40 L235 40 L270 78 L305 40 L338 40 L440 195 L375 247 L338 137 L387 437 L153 437 L203 137 L165 247 L100 195 Z";

const ARROW_SIZE = 9;

/** The arrow's head at `tip`, pointing away from `from`. */
function headPoints(tip: Point, from: Point): string {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const corner = (turn: number): Point => [
    tip[0] - ARROW_SIZE * Math.cos(angle + turn),
    tip[1] - ARROW_SIZE * Math.sin(angle + turn),
  ];
  return [tip, corner(0.45), corner(-0.45)].map(([x, y]) => `${x},${y}`).join(" ");
}

/** A measurement's line, a head on each end. It may bend, as a sleeve's does at the shoulder. */
function Measure({ points }: { points: readonly Point[] }) {
  const last = points.length - 1;
  return (
    <g>
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        className="stroke-primary"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <polygon points={headPoints(points[0], points[1])} className="fill-primary" />
      <polygon points={headPoints(points[last], points[last - 1])} className="fill-primary" />
    </g>
  );
}

/** A label, on one line or two; `y` is the first line's. */
function Label({ x, y, lines }: { x: number; y: number; lines: readonly string[] }) {
  return (
    <text x={x} y={y} textAnchor="middle" className="fill-foreground text-[17px] font-semibold">
      {lines.map((line, index) => (
        <tspan key={line} x={x} dy={index === 0 ? 0 : 20}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

const WORDS = {
  ar: {
    title: "القياسات على عباية مفرودة",
    length: ["الطول"],
    chest: ["عرض الصدر"],
    waist: ["عرض الوسط"],
    hem: ["عرض الأسفل"],
    sleeve: ["طول الكم"],
    opening: ["فتحة الكم"],
    armpit: ["ارتفاع الإبط"],
  },
  en: {
    title: "Measurements on an abaya laid flat",
    length: ["Full", "length"],
    chest: ["Chest width"],
    waist: ["Waist width"],
    hem: ["Hem width"],
    sleeve: ["Sleeve", "length"],
    opening: ["Sleeve", "opening"],
    armpit: ["Armpit", "height"],
  },
} as const;

export function GarmentMeasureDiagram({ lang }: { lang: "ar" | "en" }) {
  const words = WORDS[lang];
  return (
    <svg
      viewBox="0 0 520 500"
      role="img"
      aria-label={words.title}
      className="mx-auto block h-auto w-full max-w-md"
    >
      <path
        d={GARMENT}
        className="fill-muted stroke-foreground/70"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />

      {/* Where the full length starts and ends, carried out to its line. */}
      <path
        d="M66 40 H205 M66 437 H153"
        fill="none"
        className="stroke-muted-foreground/60"
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      <Measure
        points={[
          [62, 40],
          [62, 437],
        ]}
      />
      <Label x={28} y={lang === "ar" ? 244 : 234} lines={words.length} />

      <Measure
        points={[
          [216, 48],
          [216, 130],
        ]}
      />
      <Label x={272} y={lang === "ar" ? 112 : 100} lines={words.armpit} />

      <Measure
        points={[
          [207, 150],
          [334, 150],
        ]}
      />
      <Label x={270} y={176} lines={words.chest} />

      <Measure
        points={[
          [183, 280],
          [357, 280],
        ]}
      />
      <Label x={270} y={306} lines={words.waist} />

      <Measure
        points={[
          [153, 458],
          [387, 458],
        ]}
      />
      <Label x={270} y={486} lines={words.hem} />

      <Measure
        points={[
          [305, 24],
          [348, 24],
          [453, 184],
        ]}
      />
      <Label x={462} y={lang === "ar" ? 104 : 92} lines={words.sleeve} />

      <Measure
        points={[
          [450, 206],
          [385, 258],
        ]}
      />
      <Label x={464} y={266} lines={words.opening} />
    </svg>
  );
}
