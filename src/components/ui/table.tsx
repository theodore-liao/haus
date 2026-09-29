import { cn } from "@/lib/utils";
import { kickerClass } from "@/components/type";

export function Table({
  className,
  containerClassName,
  containerRef,
  ...props
}: React.HTMLAttributes<HTMLTableElement> & {
  containerClassName?: string;
  containerRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={containerRef} className={cn("relative w-full min-w-0 overflow-auto", containerClassName)}>
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
      className={cn("border-b border-border transition-colors hover:bg-secondary/50", className)}
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
