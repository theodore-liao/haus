"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

type Session = {
  token: string;
  onSuccess: (publicToken: string) => void;
  onExit: () => void;
};

let setSession: ((s: Session | null) => void) | null = null;

export function launchPlaidLink(session: Session) {
  setSession?.(session);
}

export function PlaidLinkHost() {
  const [session, set] = useState<Session | null>(null);

  useEffect(() => {
    setSession = set;
    return () => {
      if (setSession === set) setSession = null;
    };
  }, []);

  const onSuccess = useCallback(
    (publicToken: string | null) => {
      if (publicToken) session?.onSuccess(publicToken);
      set(null);
    },
    [session],
  );

  const onExit = useCallback(() => {
    session?.onExit();
    set(null);
  }, [session]);

  const { open, ready } = usePlaidLink({
    token: session?.token ?? null,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (session?.token && ready) open();
  }, [session?.token, ready, open]);

  return null;
}
