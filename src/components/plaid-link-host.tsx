"use client";

import { useEffect, useRef, useState } from "react";

type Session = {
  token: string;
  onSuccess: (publicToken: string) => void;
  onExit: () => void;
};

type PlaidHandler = { open: () => void; exit: (opts?: { force?: boolean }) => void; destroy: () => void };
type PlaidGlobal = {
  create: (config: {
    token: string;
    onSuccess: (publicToken: string) => void;
    onExit: () => void;
  }) => PlaidHandler;
};

const SCRIPT_SRC = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

let setSession: ((s: Session | null) => void) | null = null;
let scriptLoad: Promise<PlaidGlobal> | null = null;

/** Load link-initialize.js exactly once per document. Reuses a tag that is already present (hot reload,
 *  StrictMode double-mount) instead of appending another, which is what triggered Plaid's warning. */
function loadPlaid(): Promise<PlaidGlobal> {
  if (scriptLoad) return scriptLoad;
  scriptLoad = new Promise<PlaidGlobal>((resolve, reject) => {
    const existing = (window as unknown as { Plaid?: PlaidGlobal }).Plaid;
    if (existing) return resolve(existing);
    let tag = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!tag) {
      tag = document.createElement("script");
      tag.src = SCRIPT_SRC;
      tag.async = true;
      document.head.appendChild(tag);
    }
    tag.addEventListener("load", () => {
      const g = (window as unknown as { Plaid?: PlaidGlobal }).Plaid;
      if (g) resolve(g);
      else reject(new Error("Plaid Link did not initialise."));
    });
    tag.addEventListener("error", () => {
      scriptLoad = null;
      reject(new Error("Could not load Plaid Link."));
    });
  });
  return scriptLoad;
}

export function launchPlaidLink(session: Session) {
  setSession?.(session);
}

export function PlaidLinkHost() {
  const [session, set] = useState<Session | null>(null);
  const handler = useRef<PlaidHandler | null>(null);

  useEffect(() => {
    setSession = set;
    return () => {
      if (setSession === set) setSession = null;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    loadPlaid()
      .then((Plaid) => {
        if (cancelled) return;
        handler.current?.destroy();
        handler.current = Plaid.create({
          token: session.token,
          onSuccess: (publicToken) => {
            session.onSuccess(publicToken);
            set(null);
          },
          onExit: () => {
            session.onExit();
            set(null);
          },
        });
        handler.current.open();
      })
      .catch(() => {
        session.onExit();
        set(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return null;
}
