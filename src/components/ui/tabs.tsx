"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "tabs-fit inline-flex min-h-9 max-w-full flex-wrap items-center gap-1 rounded-lg border border-border bg-card/80 p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, children, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex min-w-0 max-w-full cursor-pointer items-center overflow-hidden whitespace-nowrap rounded-md px-3 py-1 text-sm text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=active]:bg-secondary data-[state=active]:text-foreground",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-4", className)} {...props} />;
}
