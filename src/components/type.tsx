import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Uppercase kicker: card titles, form labels, table heads, section labels, metric labels. */
export const kickerClass = "kicker";

/** Named entity inside a card: Home - Joint, wallet, Children, Cashflow. */
export function ObjectTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "truncate whitespace-nowrap text-base font-medium tracking-normal text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** Who owns the thing: primary, spouse, or joint. Always faded and set apart from the name it follows. */
export function OwnerTag({ className, children, ...props }: ComponentProps<"span">) {
  if (!children) return null;
  return (
    <span className={cn("owner-tag", className)} {...props}>
      {children}
    </span>
  );
}

/** Page section kicker above a grid of cards. */
export function SectionLabel({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn(kickerClass, "mb-3", className)} {...props} />;
}
