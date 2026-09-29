"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Segmented } from "./number-field";
import { UiScaleSlider } from "./ui-scale";
import { DEFAULT_RANGE, RANGE_KEYS, type RangeKey } from "@/lib/range";
import {
  DEFAULT_MONTH_WINDOW,
  DEFAULT_MOVERS_WINDOW,
  setDefaultRange,
  setMonthWindow,
  setMoversWindow,
  storedDefaultRange,
  storedMoversWindow,
  type MonthWindow,
  type MoversWindow,
} from "@/lib/prefs";
import { NAV_ORDER_KEY } from "@/lib/nav";

const ORDER_KEYS = [NAV_ORDER_KEY, "haus.cryptoWalletOrder"];

/** Per-browser display preferences: text size, default chart window, default month, layout order. */
export function DisplayPrefs({ month: initialMonth = DEFAULT_MONTH_WINDOW }: { month?: MonthWindow }) {
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [movers, setMovers] = useState<MoversWindow>(DEFAULT_MOVERS_WINDOW);
  const [month, setMonth] = useState<MonthWindow>(initialMonth);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRange(storedDefaultRange() ?? DEFAULT_RANGE);
    setMovers(storedMoversWindow() ?? DEFAULT_MOVERS_WINDOW);
  }, []);

  return (
    <div className="space-y-5">
      <UiScaleSlider />

      <PrefRow label="Default chart window" hint="The net worth chart opens on this range.">
        <Segmented
          label="Default chart window"
          value={range}
          options={RANGE_KEYS.map((k) => ({ value: k, label: k === "all" ? "All" : k.toUpperCase() }))}
          onChange={(k) => {
            setRange(k);
            setDefaultRange(k === DEFAULT_RANGE ? null : k);
          }}
        />
      </PrefRow>

      <PrefRow label="Default movers window" hint="Stocks and crypto largest moves open on this window.">
        <Segmented
          label="Default movers window"
          value={movers}
          options={[
            { value: "day", label: "1D" },
            { value: "week", label: "1W" },
            { value: "month", label: "1M" },
          ]}
          onChange={(key) => {
            setMovers(key);
            setMoversWindow(key === DEFAULT_MOVERS_WINDOW ? null : key);
          }}
        />
      </PrefRow>

      <PrefRow label="Default month" hint="Cashflow, spending, and transactions open on this month.">
        <Segmented
          label="Default month"
          value={month}
          options={[
            { value: "current", label: "Current" },
            { value: "previous", label: "Previous" },
          ]}
          onChange={(key) => {
            setMonth(key);
            setMonthWindow(key === DEFAULT_MONTH_WINDOW ? null : key);
          }}
        />
      </PrefRow>

      <PrefRow label="Layout order" hint="Sidebar and wallet tiles can be dragged; this puts them back.">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            try {
              for (const k of ORDER_KEYS) localStorage.removeItem(k);
            } catch {
              /* ignore */
            }
            toast.success("Default order restored. Reload to see it.");
          }}
        >
          Restore defaults
        </Button>
      </PrefRow>
    </div>
  );
}

function PrefRow({
  label,
  hint,
  children,
  inline,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
  /** A small control (a switch) stays on the right of its text instead of wrapping under it. */
  inline?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${inline ? "" : "flex-wrap"}`}>
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        <div className="footnote">{hint}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
