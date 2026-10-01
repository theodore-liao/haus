"use client";

import { useEffect, useState } from "react";

/**
 * Whether `el`'s content fits without scrolling. Boxes that scroll inside a card keep the wheel to themselves so the
 * page doesn't lurch at their ends, and Chrome does that even when nothing overflows, leaving the page stuck under the
 * pointer. Render the result as `data-scroll-fits` so CSS hands the wheel back to the page.
 */
export function useScrollFits(el: HTMLElement | null) {
  const [fits, setFits] = useState(false);
  useEffect(() => {
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setFits(el.scrollHeight <= el.clientHeight + 1);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const resize = new ResizeObserver(schedule);
    resize.observe(el);
    for (const child of el.children) resize.observe(child);
    const changes = new MutationObserver(() => {
      for (const child of el.children) resize.observe(child);
      schedule();
    });
    changes.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      changes.disconnect();
    };
  }, [el]);
  return fits;
}
