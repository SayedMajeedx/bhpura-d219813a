export type Ctx = CanvasRenderingContext2D;
export type Words = { ar: string; en: string };

export type Tone = {
  grain: number;
  name: Words;
  bg: string;
  ink: string;
  sub: string;
  tag: string;
  tagInk: string;
  stitch: string;
};

export type Token = { t: string; mark: boolean; w: number };
export type Wrapped = { lines: { tokens: Token[]; w: number }[]; space: number };
export type TextLayout = Wrapped & {
  size: number;
  lh: number;
  family: string;
  weight: number;
  noTag?: boolean;
};

export type Crop = { z?: number; fx?: number; fy?: number };

/** How a photo laid on a post is shown: bare, cut out with a white edge, a print, or taped on. */
export type PhotoFrame = "none" | "cut" | "polaroid" | "tape";

export type Sticker = {
  id: string;
  x: number;
  y: number;
  s: number;
  r?: number;
  flip?: boolean;
  photo?: string;
  crop?: Crop;
  /** A photo's frame. None written is a print, as every photo was before the frames. */
  frame?: PhotoFrame;
  /** A photo's shadow; none written is its frame's own. */
  shadow?: boolean;
  /** A cut-out's white edge: thin, or as it always was. */
  edge?: StickerEdge;
  /** A cut-out's edge in cream rather than white. */
  edgeColor?: EdgeColor;
  /** The words of a words sticker or a piece that holds words (paper, bubble, burst, tag). */
  text?: string;
  /** How a words sticker is set. */
  look?: TextLook;
  /** A words sticker's or a drawn mark's colour, one of the cloth's. */
  color?: TextColor;
  align?: TextAlign;
};

export type TextLook = "plain" | "meme" | "box" | "hand";
export type TextColor = "ink" | "tag" | "bg" | "white" | "black";
export type TextAlign = "right" | "center" | "left";
/** Where a drawn sticker is listed in the maker. */
export type StickerGroup = "marks" | "paper" | "words";

export type StickerEdge = "thin";
export type EdgeColor = "cream";

export type StickerDef = {
  name: Words;
  art?: (c: Ctx, tone: Tone, text: string, flipped: boolean) => void;
  stitch?: boolean;
  text?: boolean;
  sample?: string;
  photoCard?: boolean;
  /** Drawn straight on the post in the cloth's colours, with no white cut edge. */
  bare?: boolean;
  /** Holds its own words (`Sticker.text`), not the post's. */
  ownText?: boolean;
  /** Its list in the maker; none is Shammoua and her drawings. */
  group?: StickerGroup;
};

export type PaperLook = "receipt" | "circular" | "licence";

export type Post = {
  key: string;
  series: string;
  title: string;
  tpl: string;
  tone: string;
  size: "post" | "story";
  lead?: string;
  head?: string;
  headMax?: number;
  foot?: string;
  label?: string;
  labelA?: string;
  labelB?: string;
  chat?: string;
  chatSize?: number;
  items?: string;
  bag?: string;
  /** The look of the paper layout, and the words only a paper has. */
  paper?: PaperLook;
  total?: string;
  stamp?: string;
  /** The cup's bracket: each round's names, an empty string for a place not decided. */
  rounds?: string[][];
  photo1?: string;
  photo2?: string;
  focus?: number;
  crop?: Record<string, Crop>;
  stickers: Sticker[];
  caption: string;
  note?: string;
};

export type Photo = {
  label: string;
  /** The piece's whole name with no price, "عباية كلاود", for a Piece card's headline. */
  name?: string;
  full?: string;
  img?: HTMLImageElement;
  url?: string;
  upload?: boolean;
  /** A sticker the store cut from a photo: listed with the stickers, not the photos. */
  sticker?: boolean;
  /** The upload a sticker was cut from, while it is kept. */
  source?: string;
};
export type PhotoBook = Record<string, Photo>;

export type Geometry = {
  W: number;
  H: number;
  M: number;
  story: boolean;
  T: number;
  B: number;
  logoTop: number;
  logoW: number;
};
