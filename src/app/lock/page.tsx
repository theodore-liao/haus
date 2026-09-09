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
        <div className="text-xl font-medium tracking-[0.32em] text-primary">HAUS</div>
        <h1 className="mt-3 text-2xl font-medium tracking-tight">Household lock</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enter the household passphrase.</p>
        <div className="mt-8 space-y-3">
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
