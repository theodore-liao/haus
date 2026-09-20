"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LockPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
      <form onSubmit={onSubmit} className="w-full max-w-sm">
        <div className="mb-6 bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-lg font-medium tracking-[0.32em] text-transparent">
          HAUS
        </div>
        <div className="page-title">
          <h1>Household lock</h1>
          <p>Enter the household passphrase.</p>
        </div>
        <div className="mt-6 space-y-3">
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Passphrase"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p className="text-sm text-negative">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy || !password}>
            {busy ? "Checking…" : "Enter"}
          </Button>
        </div>
      </form>
    </main>
  );
}
