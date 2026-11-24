import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";
import { TabsPill } from "@/components/motion/TabsPill";
import {
  SEGMENT_TAB,
  SEGMENT_TAB_IDLE,
  SEGMENT_TRACK,
  STORE_SEGMENT_TAB,
  STORE_SEGMENT_TRACK,
} from "@/components/ui/segmented";

const Tabs = TabsPrimitive.Root;

/** Whose look a bar wears: the admin's, or the store's own on a storefront page (segmented.ts). */
type TabsLook = "admin" | "store";
const LookContext = React.createContext<TabsLook>("admin");

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { look?: TabsLook }
>(({ className, children, look = "admin", ...props }, ref) => (
  <LookContext.Provider value={look}>
    <TabsPrimitive.List
      ref={ref}
      // The one tab bar look (segmented.ts); a page adds only its layout.
      className={cn(look === "store" ? STORE_SEGMENT_TRACK : SEGMENT_TRACK, className)}
      {...props}
    >
      {/* The active tab's background slides between tabs (transitions.dev's tabs sliding). */}
      <TabsPill />
      {children}
    </TabsPrimitive.List>
  </LookContext.Provider>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const look = React.useContext(LookContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        look === "store"
          ? [
              STORE_SEGMENT_TAB,
              // The idle look by state, so a hover never darkens the chosen tab's words on its fill.
              "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground",
              "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
            ]
          : [
              SEGMENT_TAB,
              SEGMENT_TAB_IDLE,
              "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs",
            ],
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
