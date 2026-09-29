import { Landmark, type LucideIcon } from "lucide-react";
import { ConnectPlaid } from "./connect-plaid";
import { Skeleton } from "./ui/skeleton";
import { Button } from "./ui/button";
import { NAV } from "@/lib/nav";

export function EmptyLedger({
  title,
  body,
  showConnect = true,
  plaidReady = true,
  page,
  icon,
  action,
}: {
  title: string;
  body: string;
  showConnect?: boolean;
  /** False when bank linking is not set up here: the button is off and says why. */
  plaidReady?: boolean;
  /** The page's route: its sidebar icon goes in the glowing badge. */
  page?: string;
  icon?: LucideIcon;
  /** The page's own first step, in place of Add institution. */
  action?: React.ReactNode;
}) {
  const Icon = icon ?? NAV.find((item) => item.href === page)?.icon ?? Landmark;
  return (
    <div className="empty-state surface flex min-h-[52vh] flex-col items-center justify-center rounded-[var(--radius-card)] px-6 py-16 text-center">
      <div className="empty-badge">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
      {showConnect && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <ConnectPlaid disabled={!plaidReady} />
          {!plaidReady ? <p className="footnote">Bank linking isn&apos;t set up on this computer yet.</p> : null}
        </div>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-6">
      <p className="text-sm text-negative">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** The shape most pages share while they load: title, summary card, two cards side by side, one wide card. */
export function PageSkeleton() {
  return (
    <div className="page-stack" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="skeleton-card h-40 w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="skeleton-card h-72" />
        <Skeleton className="skeleton-card h-72" />
      </div>
      <Skeleton className="skeleton-card h-56 w-full" />
    </div>
  );
}
