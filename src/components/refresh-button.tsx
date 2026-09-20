"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";

export function RefreshButton({
  lastSynced,
  iconOnly,
  autoSync = true,
}: {
  lastSynced?: string | null;
  iconOnly?: boolean;
  /** Only one mounted instance should own the stale-ledger auto refresh. */
  autoSync?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function refresh(force = true) {
    setBusy(true);
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Refresh failed.");
        return;
      }
      if (data.skipped) return;
      toast.success(data.message ?? "Ledger refreshed.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!autoSync) return;
    const stale =
      !lastSynced || Date.now() - new Date(lastSynced).getTime() > 4 * 60 * 60 * 1000;
    if (stale) refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (iconOnly) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => refresh(true)}
        disabled={busy}
        aria-label={busy ? "Refreshing" : "Refresh all"}
        title="Refresh all"
      >
        <RefreshCw className={busy ? "animate-spin" : ""} />
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={() => refresh(true)} disabled={busy}>
      <RefreshCw className={busy ? "animate-spin" : ""} />
      {busy ? "Refreshing" : "Refresh all"}
    </Button>
  );
}
