"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { OwnerAssign } from "./owner-assign";
import { launchPlaidLink } from "./plaid-link-host";
import { linkExitMessage } from "@/lib/plaid-link-error";

type LinkedAccount = {
  id: string;
  name: string;
  mask: string | null;
  hausType: string;
  owner: string;
};

type LinkedItem = {
  id: string;
  institutionName: string | null;
  accounts: LinkedAccount[];
};

export function ConnectPlaid({
  label = "Add institution",
  itemId,
  relink = false,
  variant = "default",
  disabled = false,
}: {
  label?: string;
  itemId?: string;
  relink?: boolean;
  /** Quiet when the connection is healthy, so the loudest button is the one that needs pressing. */
  variant?: "default" | "outline" | "ghost";
  /** Off when bank linking is not set up here. */
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [assignment, setAssignment] = useState<LinkedItem | null>(null);

  const onSuccess = useCallback(
    async (publicToken: string | null) => {
      if (!publicToken) return;
      setBusy(true);
      try {
        const res = await fetch("/api/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_token: publicToken, itemId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Could not exchange token.");
          return;
        }
        if (relink) {
          toast.success("Institution relinked. Syncing.");
          await fetch("/api/plaid/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: data.item.id }),
          });
          router.refresh();
          return;
        }
        setAssignment(data.item);
      } finally {
        setBusy(false);
      }
    },
    [itemId, relink, router],
  );

  const loadToken = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/plaid/link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, relink }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Bank linking isn't set up on this computer.");
        setBusy(false);
        return;
      }
      launchPlaidLink({
        token: data.link_token,
        onSuccess: (publicToken) => {
          void onSuccess(publicToken);
        },
        onExit: (error, metadata) => {
          setBusy(false);
          const message = linkExitMessage(error, metadata?.institution?.name);
          if (!message) return;
          // Long enough to read or copy; Plaid's code in brackets is what to pass on when asking for help.
          toast.error(message, { duration: 20000 });
          void fetch("/api/plaid/link-error", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error,
              institution: metadata?.institution?.name ?? null,
              institutionId: metadata?.institution?.institution_id ?? null,
              status: metadata?.status ?? null,
              linkSessionId: metadata?.link_session_id ?? null,
              requestId: metadata?.request_id ?? null,
              relink,
            }),
          }).catch(() => {});
        },
      });
    } catch {
      toast.error("Could not start bank linking. Try again.");
      setBusy(false);
    }
  }, [itemId, relink, onSuccess]);

  return (
    <>
      <Button variant={variant} size={variant === "default" ? undefined : "sm"} onClick={() => loadToken()} disabled={busy || disabled}>
        {busy ? "Connecting…" : label}
      </Button>
      {assignment && (
        <OwnerAssign
          item={assignment}
          onDone={() => {
            setAssignment(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
