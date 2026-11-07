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

export type Sticker = {
  id: string;
  x: number;
  y: number;
  s: number;
  r?: number;
  flip?: boolean;
  photo?: string;
  crop?: Crop;
};

export type StickerDef = {
  name: Words;
  art?: (c: Ctx, tone: Tone, text: string, flipped: boolean) => void;
  stitch?: boolean;
  text?: boolean;
  sample?: string;
  photoCard?: boolean;
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
