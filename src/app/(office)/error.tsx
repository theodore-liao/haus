"use client";

import { Button } from "@/components/ui/button";

export default function ErrorView({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-8">
      <h2 className="text-base font-medium">This page could not be loaded</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message || "An unexpected error occurred."}</p>
      <Button className="mt-4" variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
