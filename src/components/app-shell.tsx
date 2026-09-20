"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { NAV, MOBILE_PRIMARY, NAV_ORDER_KEY, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { RefreshButton } from "./refresh-button";
import { PlaidLinkHost } from "./plaid-link-host";
import { UiScaleSync } from "./ui-scale";
import { formatDateTime } from "@/lib/format";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { NavRail } from "./nav-rail";

function orderedNav(saved: string[] | null): NavItem[] {
  const known = NAV.map((n) => n.href);
  const base = saved?.filter((h) => known.includes(h)) ?? [];
  for (const h of known) if (!base.includes(h)) base.push(h);
  return base.map((h) => NAV.find((n) => n.href === h)!);
}

export function AppShell({
  children,
  nameA,
  nameB,
  lastSynced,
}: {
  children: React.ReactNode;
  nameA: string;
  nameB: string;
  lastSynced?: string | null;
}) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const [items, setItems] = useState<NavItem[]>(NAV);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NAV_ORDER_KEY);
      setItems(orderedNav(raw ? (JSON.parse(raw) as string[]) : null));
    } catch {
      setItems(NAV);
    }
  }, []);

  function persist(next: NavItem[]) {
    setItems(next);
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(next.map((n) => n.href)));
  }

  return (
    <div className="min-h-screen bg-background">
      <UiScaleSync />
      <PlaidLinkHost />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-sidebar md:flex md:flex-col">
        <div className="px-5 pb-6 pt-7">
          <div className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-lg font-medium tracking-[0.32em] text-transparent">
            HAUS
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {nameA} & {nameB}
          </div>
        </div>
        <NavRail items={items} pathname={pathname} onReorder={persist} />
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <div className="footnote min-w-0">
            Last sync
            <div className="num truncate text-xs text-foreground/80">{formatDateTime(lastSynced)}</div>
          </div>
          <RefreshButton lastSynced={lastSynced} iconOnly />
        </div>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/80 bg-background/70 px-4 py-3 backdrop-blur-md md:hidden">
          <span className="text-base font-medium tracking-[0.32em] text-primary">HAUS</span>
          <RefreshButton lastSynced={lastSynced} autoSync={false} />
        </header>
        <main className="page-stack py-5 pb-24 md:py-8 md:pb-12">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-sidebar md:hidden">
        {MOBILE_PRIMARY.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[0.6875rem]",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMore(true)}
          className={cn(
            "flex flex-col items-center gap-1 py-2.5 text-[0.6875rem]",
            more ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Menu className="h-4 w-4" />
          More
        </button>
      </nav>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="rounded-t-lg">
          <SheetHeader>
            <SheetTitle>Household</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-2 pb-4">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMore(false)}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-3 text-sm text-muted-foreground"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
