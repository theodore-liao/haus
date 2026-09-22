"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type Drag = {
  id: string;
  from: number;
  over: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
  rects: DOMRect[];
};

function visualIndex(index: number, from: number, to: number) {
  if (index === from) return to;
  if (from < to && index > from && index <= to) return index - 1;
  if (from > to && index >= to && index < from) return index + 1;
  return index;
}

function indexFromPoint(x: number, y: number, rects: DOMRect[]) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export function SortableGrid<T extends { id: string }>({
  items,
  onReorder,
  className,
  render,
  extra,
}: {
  items: T[];
  onReorder: (next: T[]) => void;
  className?: string;
  render: (item: T, handle: ReactNode) => ReactNode;
  extra?: ReactNode;
}) {
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
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
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const over = indexFromPoint(e.clientX, e.clientY, d.rects);
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

  function onGripDown(e: React.PointerEvent, id: string, index: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = cellRefs.current.get(id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rects = itemsRef.current.map((item) => cellRefs.current.get(item.id)?.getBoundingClientRect() ?? rect);
    el.setPointerCapture(e.pointerId);
    setDrag({
      id,
      from: index,
      over: index,
      width: rect.width,
      height: rect.height,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      x: rect.left,
      y: rect.top,
      rects,
    });
  }

  const dragged = drag ? items.find((i) => i.id === drag.id) : null;

  return (
    <>
      {/* [&>*]:min-w-0 keeps one wide card (long address, big figure) from stretching a track past the viewport. */}
      <div className={cn("grid gap-4 md:grid-cols-2 [&>*]:min-w-0", drag && "select-none", className)}>
        {items.map((item, index) => {
          let dx = 0;
          let dy = 0;
          if (drag) {
            const vis = visualIndex(index, drag.from, drag.over);
            const from = drag.rects[index];
            const to = drag.rects[vis];
            if (from && to) {
              dx = to.left - from.left;
              dy = to.top - from.top;
            }
          }
          const isSource = drag?.id === item.id;
          const handle = (
            <button
              type="button"
              aria-label="Reorder"
              onPointerDown={(e) => onGripDown(e, item.id, index)}
              className="cursor-grab touch-none rounded p-1 text-muted-foreground opacity-25 hover:opacity-70 active:cursor-grabbing"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          );
          return (
            <div
              key={item.id}
              ref={(node) => {
                if (node) cellRefs.current.set(item.id, node);
                else cellRefs.current.delete(item.id);
              }}
              style={{
                transform: dx || dy ? `translate(${dx}px, ${dy}px)` : undefined,
                transition: drag ? "transform 160ms ease" : undefined,
                zIndex: isSource ? 2 : 1,
              }}
              className={cn(isSource && "opacity-30")}
            >
              {render(item, handle)}
            </div>
          );
        })}
        {extra}
      </div>
      {drag && dragged && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[80] rotate-[-1deg] shadow-lg"
              style={{
                left: drag.x,
                top: drag.y,
                width: drag.width,
                height: drag.height,
              }}
            >
              {render(
                dragged,
                <span className="rounded p-1 text-primary/70">
                  <GripVertical className="h-3.5 w-3.5" />
                </span>,
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function useStoredOrder<T extends { id: string }>(storageKey: string, items: T[]): [T[], (next: T[]) => void] {
  const [order, setOrder] = useState<string[] | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) setOrder(parsed);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const ordered = (() => {
    if (!order) return items;
    const map = new Map(items.map((i) => [i.id, i]));
    const out: T[] = [];
    for (const id of order) {
      const row = map.get(id);
      if (row) {
        out.push(row);
        map.delete(id);
      }
    }
    for (const row of items) if (map.has(row.id)) out.push(row);
    return out;
  })();

  function reorder(next: T[]) {
    const ids = next.map((i) => i.id);
    setOrder(ids);
    try {
      localStorage.setItem(storageKey, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  }

  return [ordered, reorder];
}
