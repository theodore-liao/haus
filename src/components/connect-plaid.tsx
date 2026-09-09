"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { OwnerAssign } from "./owner-assign";
import { launchPlaidLink } from "./plaid-link-host";

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
}: {
  label?: string;
  itemId?: string;
  relink?: boolean;
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
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Plaid is not configured.");
        setBusy(false);
        return;
      }
      launchPlaidLink({
        token: data.link_token,
        onSuccess: (publicToken) => {
          void onSuccess(publicToken);
        },
        onExit: () => setBusy(false),
      });
    } catch {
      setBusy(false);
    }
  }, [itemId, relink, onSuccess]);

  return (
    <>
      <Button onClick={() => loadToken()} disabled={busy}>
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
