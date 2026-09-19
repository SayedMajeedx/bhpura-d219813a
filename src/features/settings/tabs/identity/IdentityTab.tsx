import * as React from "react";
import { BasicsGroup } from "./BasicsGroup";
import { VerticalGroup } from "./VerticalGroup";
import { PaletteGroup } from "./PaletteGroup";
import { TypographyGroup } from "./TypographyGroup";
import { ContactGroup } from "./ContactGroup";

export function IdentityTab() {
  return (
    <div className="space-y-6">
      <BasicsGroup />
      <VerticalGroup />
      <PaletteGroup />
      <TypographyGroup />
      <ContactGroup />
    </div>
  );
}
