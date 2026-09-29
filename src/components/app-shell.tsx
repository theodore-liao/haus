"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Pin } from "lucide-react";
import { NAV, NAV_ORDER_KEY, mobilePrimary, mergeVisibleOrder, resolveNavOrder, visibleNav, type NavItem, type TabVisibility } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { RefreshButton } from "./refresh-button";
import { PlaidLinkHost } from "./plaid-link-host";
import { UiScaleSync } from "./ui-scale";
import { formatDateTime } from "@/lib/format";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { NavRail } from "./nav-rail";
import { PrivacyToggle } from "./privacy-toggle";

export function AppShell({
  children,
  nameA,
  nameB,
  lastSynced,
  tabs,
}: {
  children: React.ReactNode;
  nameA: string;
  nameB: string;
  lastSynced?: string | null;
  tabs: TabVisibility;
}) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const [items, setItems] = useState<NavItem[]>(NAV);
  const shown = visibleNav(items, tabs);
  const barItems = mobilePrimary(shown);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NAV_ORDER_KEY);
      setItems(resolveNavOrder(raw ? (JSON.parse(raw) as string[]) : null));
    } catch {
      setItems(NAV);
    }
  }, []);

  function persist(next: NavItem[]) {
    const merged = mergeVisibleOrder(items, next);
    setItems(merged);
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(merged.map((n) => n.href)));
  }

  return (
    <div className="app-canvas min-h-screen">
      <UiScaleSync />
      <PlaidLinkHost />
      <aside className="nav-panel fixed inset-y-0 left-0 z-30 hidden w-[var(--nav-width)] border-r border-border md:flex md:flex-col">
        <div className="flex items-start justify-between gap-2 px-5 pb-6 pt-7">
          <div className="min-w-0">
            <div className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-lg font-medium tracking-[0.32em] text-transparent">
              HAUS
            </div>
            <div className="mt-1 truncate text-sm text-muted-foreground">
              {nameA} & {nameB}
            </div>
          </div>
          <PrivacyToggle />
        </div>
        <NavRail items={shown} pathname={pathname} onReorder={persist} />
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <div className="footnote min-w-0">
            Last sync
            <div className="num truncate text-xs text-foreground/80">{formatDateTime(lastSynced)}</div>
          </div>
          <RefreshButton lastSynced={lastSynced} iconOnly />
        </div>
      </aside>

      <div className="min-w-0 md:pl-[var(--nav-width)]">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/80 bg-background/70 px-4 py-3 backdrop-blur-md md:hidden">
          <span className="text-base font-medium tracking-[0.32em] text-primary">HAUS</span>
          <div className="flex items-center gap-2">
            <PrivacyToggle />
            <RefreshButton lastSynced={lastSynced} autoSync={false} />
          </div>
        </header>
        <main className="page-stack py-5 pb-24 md:py-8 md:pb-12">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-sidebar md:hidden">
        {barItems.map((item) => {
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
            {shown.map((item, i) => {
              const Icon = item.icon;
              const pinned = i < barItems.length;
              return (
                <div key={item.href} className="flex items-center rounded-md border border-border">
                  <Link
                    href={item.href}
                    onClick={() => setMore(false)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-sm text-muted-foreground"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                  {pinned ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mr-1 h-8 w-8 shrink-0"
                      aria-label={`Pin ${item.label} to the bar`}
                      title="Pin to the bar"
                      onClick={() => persist([item, ...shown.filter((other) => other.href !== item.href)])}
                    >
                      <Pin />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
