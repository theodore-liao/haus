"use client";

import { useEffect, useRef, useState } from "react";

/** What Plaid passes to onExit when Link closes on an error. Null fields are left out by Plaid on some errors. */
export type PlaidExitError = {
  error_type?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  display_message?: string | null;
};
export type PlaidExitMetadata = {
  institution?: { name?: string | null; institution_id?: string | null } | null;
  status?: string | null;
  link_session_id?: string | null;
  request_id?: string | null;
};

type Session = {
  token: string;
  onSuccess: (publicToken: string) => void;
  /** `error` is null when the person closed Link themselves. */
  onExit: (error: PlaidExitError | null, metadata: PlaidExitMetadata | null) => void;
};

type PlaidHandler = { open: () => void; exit: (opts?: { force?: boolean }) => void; destroy: () => void };
type PlaidGlobal = {
  create: (config: {
    token: string;
    onSuccess: (publicToken: string) => void;
    onExit: (error: PlaidExitError | null, metadata: PlaidExitMetadata | null) => void;
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
          onExit: (error, metadata) => {
            session.onExit(error ?? null, metadata ?? null);
            set(null);
          },
        });
        handler.current.open();
      })
      .catch(() => {
        session.onExit({ error_code: "LINK_SCRIPT_LOAD_FAILED", display_message: "Couldn’t load Plaid. Check the internet connection and try again." }, null);
        set(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return null;
}
