import { cn } from "@/lib/utils";
import { kickerClass } from "@/components/type";

export function Table({
  className,
  containerClassName,
  containerRef,
  scrollFits,
  ...props
}: React.HTMLAttributes<HTMLTableElement> & {
  containerClassName?: string;
  containerRef?: React.Ref<HTMLDivElement>;
  /** From `useScrollFits` on the container, so a `scroll-contain` box that fits lets the page scroll. */
  scrollFits?: boolean;
}) {
  return (
    <div
      ref={containerRef}
      data-scroll-fits={scrollFits || undefined}
      className={cn("relative w-full min-w-0 overflow-auto", containerClassName)}
    >
      <table className={cn("data-table", className)} {...props} />
    </div>
  );
}
export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_tr]:border-b [&_tr]:border-border", className)} {...props} />;
}
export function TableBody({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement> & { ref?: React.Ref<HTMLTableSectionElement> }) {
  return <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableRow({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { ref?: React.Ref<HTMLTableRowElement> }) {
  return (
    <tr
      ref={ref}
      className={cn("border-b border-border transition-colors", className)}
      {...props}
    />
  );
}
export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn(kickerClass, className)} {...props} />;
}
export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={className} {...props} />;
}
