"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/nav";

type Drag = {
  href: string;
  from: number;
  over: number;
  height: number;
  width: number;
  step: number;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
  mids: number[];
};

export function NavRail({
  items,
  pathname,
  onReorder,
}: {
  items: NavItem[];
  pathname: string;
  onReorder: (next: NavItem[]) => void;
}) {
  const listRef = useRef<HTMLElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  const commit = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0) return;
      const next = [...itemsRef.current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onReorder(next);
    },
    [onReorder],
  );

  useEffect(() => {
    if (!drag) return;

    function indexFromY(clientY: number, mids: number[]) {
      for (let i = 0; i < mids.length; i++) {
        if (clientY < mids[i]) return i;
      }
      return Math.max(0, mids.length - 1);
    }

    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const over = indexFromY(e.clientY, d.mids);
      setDrag({
        ...d,
        over,
        x: e.clientX - d.offsetX,
        y: e.clientY - d.offsetY,
      });
    }

    function onUp() {
      const d = dragRef.current;
      if (d) commit(d.from, d.over);
      setDrag(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, commit]);

  function onGripDown(e: React.PointerEvent, href: string, index: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = rowRefs.current.get(href);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rects = itemsRef.current.map((item) => rowRefs.current.get(item.href)?.getBoundingClientRect());
    const tops = rects.map((r) => r?.top ?? 0);
    const step = tops.length > 1 ? Math.abs(tops[1] - tops[0]) : rect.height;
    el.setPointerCapture(e.pointerId);
    setDrag({
      href,
      from: index,
      over: index,
      height: rect.height,
      width: rect.width,
      step,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      x: rect.left,
      y: rect.top,
      mids: rects.map((r) => (r ? r.top + r.height / 2 : 0)),
    });
  }

  const dragged = drag ? items.find((i) => i.href === drag.href) : null;

  return (
    <>
      <nav
        ref={listRef}
        className={cn("flex-1 space-y-0.5 overflow-y-auto px-3", drag && "select-none")}
      >
        {items.map((item, index) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          let dy = 0;
          if (drag) {
            const from = drag.from;
            const to = drag.over;
            if (index === from) dy = (to - from) * drag.step;
            else if (from < to && index > from && index <= to) dy = -drag.step;
            else if (from > to && index >= to && index < from) dy = drag.step;
          }
          const isSource = drag?.href === item.href;
          return (
            <div
              key={item.href}
              data-nav-href={item.href}
              ref={(node) => {
                if (node) rowRefs.current.set(item.href, node);
                else rowRefs.current.delete(item.href);
              }}
              style={{
                transform: dy ? `translateY(${dy}px)` : undefined,
                transition: drag ? "transform 160ms ease" : undefined,
                zIndex: isSource ? 2 : 1,
              }}
              className={cn(
                "group flex items-center rounded-md",
                isSource ? "opacity-30" : "transition-colors",
                !isSource &&
                  (active
                    ? "bg-secondary text-foreground shadow-[inset_0_1px_0_rgba(232,220,198,0.08)]"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"),
              )}
            >
              <Link
                href={item.href}
                draggable={false}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-[0.9375rem]"
                onClick={(e) => {
                  if (drag) e.preventDefault();
                }}
              >
                <span className={cn("h-4 w-px rounded", active ? "bg-primary" : "bg-transparent")} />
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
              <button
                type="button"
                aria-label={`Reorder ${item.label}`}
                onPointerDown={(e) => onGripDown(e, item.href, index)}
                className="cursor-grab touch-none px-1.5 py-2 text-muted-foreground opacity-20 hover:opacity-60 active:cursor-grabbing"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </nav>
      {drag && dragged && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[80] flex items-center rounded-md border border-primary/40 bg-sidebar text-primary shadow-lg"
              style={{
                left: drag.x,
                top: drag.y,
                width: drag.width,
                height: drag.height,
                transform: "rotate(-1.2deg)",
              }}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-[0.9375rem]">
                <span className="h-4 w-px rounded bg-primary" />
                <dragged.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{dragged.label}</span>
              </span>
              <span className="px-1.5 py-2 text-primary/70">
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
