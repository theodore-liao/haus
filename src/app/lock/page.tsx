"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LockPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  // A native (no-JS) form post that fails redirects back here with ?error=1.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error")) {
      setError("Denied.");
    }
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read the DOM value, not React state: Android autofill (Google Password Manager) can fill the
    // field without firing the events a controlled input relies on, leaving state empty.
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (!password) {
      setError("Enter the passphrase.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Denied.");
        return;
      }
      router.replace("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      {/* method/action make the form work even before hydration (e.g. dev over LAN). */}
      <form method="post" action="/api/auth/login" onSubmit={onSubmit} className="w-full max-w-sm">
        <div className="mb-6 bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-lg font-medium tracking-[0.32em] text-transparent">
          HAUS
        </div>
        <div className="page-title">
          <h1>Household lock</h1>
          <p>Enter the household passphrase.</p>
        </div>
        <div className="mt-6 space-y-3">
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              name="password"
              autoFocus
              autoComplete="current-password"
              placeholder="Passphrase"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide passphrase" : "Show passphrase"}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {error ? <p className="text-sm text-negative">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Checking…" : "Enter"}
          </Button>
        </div>
      </form>
    </main>
  );
}
