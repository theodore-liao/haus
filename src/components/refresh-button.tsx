"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";

// Automatic refreshes start at most once an hour, even when React mounts the shell twice in development.
let lastAuto = 0;
const AUTO_EVERY_MS = 60 * 60 * 1000;
/** Connections older than this refresh by themselves while Haus is open. */
const STALE_MS = 4 * 60 * 60 * 1000;

export function RefreshButton({
  lastSynced,
  iconOnly,
  autoSync = true,
}: {
  /** For the automatic refresh: when the oldest connection last synced. Null refreshes (and refreshes quotes alone). */
  lastSynced?: string | null;
  iconOnly?: boolean;
  /** Only one mounted instance should own the stale-ledger auto refresh. */
  autoSync?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  /** `quiet`: the automatic refresh on opening Haus says nothing when it works; only a press of the button does. */
  async function refresh(force = true, quiet = false) {
    setBusy(true);
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      // A server error can come back with no body; say the refresh failed rather than throwing on it.
      const data = (await res.json().catch(() => ({}))) as { error?: string; skipped?: boolean; message?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Refresh failed.");
        return;
      }
      if (data.skipped) return;
      if (!quiet) toast.success(data.message ?? "Ledger refreshed.");
      router.refresh();
    } catch {
      toast.error("Refresh failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // Refresh by itself once the oldest connection is over 4 hours old: on opening Haus, when it comes back into view,
  // and hourly while it stays open. The server also refreshes connections a day old when no one is looking.
  const synced = useRef(lastSynced);
  useEffect(() => {
    synced.current = lastSynced;
  }, [lastSynced]);
  useEffect(() => {
    if (!autoSync) return;
    const maybe = () => {
      const iso = synced.current;
      const due = !iso || Date.now() - Date.parse(iso) > STALE_MS;
      if (!due || document.visibilityState !== "visible" || Date.now() - lastAuto < AUTO_EVERY_MS) return;
      lastAuto = Date.now();
      void refresh(false, true);
    };
    maybe();
    const timer = setInterval(maybe, AUTO_EVERY_MS / 4);
    document.addEventListener("visibilitychange", maybe);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", maybe);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync]);

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
