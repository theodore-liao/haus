import { Landmark } from "lucide-react";
import { ConnectPlaid } from "./connect-plaid";
import { Skeleton } from "./ui/skeleton";
import { Button } from "./ui/button";

export function EmptyLedger({
  title,
  body,
  showConnect = true,
}: {
  title: string;
  body: string;
  showConnect?: boolean;
}) {
  return (
    <div className="haus-empty-pattern flex min-h-[52vh] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-16 text-center">
      <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted-foreground">
        <Landmark className="h-5 w-5" />
      </div>
      <h2 className="text-base font-medium">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
      {showConnect && (
        <div className="mt-6">
          <ConnectPlaid />
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

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
