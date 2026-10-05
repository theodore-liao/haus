"use client";

import { createContext, useContext } from "react";
import { colorFor } from "@/lib/category-colors";

/**
 * Opens a category's merchant window, the same one a donut slice opens. Overview's Budget card is built on the
 * server and handed to the cashflow block, so the block provides this and the card picks it up.
 */
export const OpenCategoryContext = createContext<((category: string) => void) | null>(null);

export function useOpenCategory() {
  return useContext(OpenCategoryContext);
}

/** A budget row's swatch and name. A button that opens the category when there is somewhere to open it. */
export function BudgetLabel({ category, onOpen }: { category: string; onOpen: ((category: string) => void) | null }) {
  const inner = (
    <>
      <span className="size-2 shrink-0 rounded-sm" style={{ background: colorFor(category) }} />
      <span className="min-w-0 flex-1 truncate text-left text-sm group-hover:underline group-hover:underline-offset-2">{category}</span>
    </>
  );
  if (!onOpen) return <div className="flex min-w-0 flex-1 items-center gap-2">{inner}</div>;
  return (
    <button
      type="button"
      className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left hover:text-foreground"
      aria-label={`Show ${category} spending`}
      onClick={() => onOpen(category)}
    >
      {inner}
    </button>
  );
}
