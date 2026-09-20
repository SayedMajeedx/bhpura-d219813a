import type { AddonManifest } from "@/lib/addons/addon-types";
import { sizeGuidesManifest } from "./size-guides/manifest";
import { fitPassportManifest } from "./fit-passport/manifest";
import { madeToOrderManifest } from "./made-to-order/manifest";
import { fashionCoreManifest } from "./fashion-core/manifest";
import { abayaPackManifest } from "./abaya-pack/manifest";
import { beautyPerfumeManifest } from "./beauty-perfume/manifest";
import { foodBeverageManifest } from "./food-beverage/manifest";
import { digitalProductsManifest } from "./digital-products/manifest";
import { giftsManifest } from "./gifts/manifest";
import { printStampsManifest } from "./print-stamps/manifest";
import { jewelryManifest } from "./jewelry/manifest";
import { coffeeRoasteryManifest } from "./coffee-roastery/manifest";

export const ADDON_MANIFESTS: AddonManifest[] = [
  sizeGuidesManifest,
  fitPassportManifest,
  madeToOrderManifest,
  fashionCoreManifest,
  abayaPackManifest,
  beautyPerfumeManifest,
  coffeeRoasteryManifest,
  foodBeverageManifest,
  digitalProductsManifest,
  giftsManifest,
  printStampsManifest,
  jewelryManifest,
];
