"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import { ChartRange } from "./chart-range";
import { UiScaleSlider } from "./ui-scale";
import { DEFAULT_RANGE, type RangeKey } from "@/lib/range";
import {
  DEFAULT_MOVERS_WINDOW,
  setDefaultRange,
  setMoversWindow,
  setPrivacy,
  storedDefaultRange,
  storedMoversWindow,
  storedPrivacy,
  type MoversWindow,
} from "@/lib/prefs";
import { NAV_ORDER_KEY } from "@/lib/nav";

const ORDER_KEYS = [NAV_ORDER_KEY, "haus.cryptoWalletOrder"];

/** Per-browser display preferences: text size, default chart window, privacy blur, layout order. */
export function DisplayPrefs() {
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [movers, setMovers] = useState<MoversWindow>(DEFAULT_MOVERS_WINDOW);
  const [privacy, setPrivacyState] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRange(storedDefaultRange() ?? DEFAULT_RANGE);
    setMovers(storedMoversWindow() ?? DEFAULT_MOVERS_WINDOW);
    setPrivacyState(storedPrivacy());
  }, []);

  return (
    <div className="space-y-5">
      <UiScaleSlider />

      <PrefRow label="Default chart window" hint="Net worth and spending charts open on this range.">
        <ChartRange
          value={range}
          onChange={(k) => {
            setRange(k);
            setDefaultRange(k === DEFAULT_RANGE ? null : k);
          }}
        />
      </PrefRow>

      <PrefRow label="Default movers window" hint="Stocks and crypto largest moves open on this window.">
        <div className="flex rounded-md border border-border p-0.5">
          {(
            [
              ["day", "1D"],
              ["week", "1w"],
              ["month", "1m"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setMovers(key);
                setMoversWindow(key === DEFAULT_MOVERS_WINDOW ? null : key);
              }}
              className={
                movers === key
                  ? "cursor-pointer rounded bg-secondary px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-primary"
                  : "cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </PrefRow>

      <PrefRow label="Blur balances" hint="Dollar amounts blur until hovered. Handy on a shared screen.">
        <Switch
          checked={privacy}
          onCheckedChange={(v) => {
            setPrivacyState(v);
            setPrivacy(v);
          }}
          aria-label="Blur balances"
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

function PrefRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        <div className="footnote">{hint}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
