import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div>
        <div className="text-[11px] font-medium tracking-[0.32em] text-primary">HAUS</div>
        <h1 className="mt-3 text-2xl font-medium">Not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">That page is not on the household ledger.</p>
        <Link href="/" className="mt-6 inline-block text-sm text-primary">
          Return to Overview
        </Link>
      </div>
    </main>
  );
}
