"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import { ChartRange } from "./chart-range";
import { UiScaleSlider } from "./ui-scale";
import { DEFAULT_RANGE, type RangeKey } from "@/lib/range";
import { setDefaultRange, setPrivacy, storedDefaultRange, storedPrivacy } from "@/lib/prefs";
import { NAV_ORDER_KEY } from "@/lib/nav";

const ORDER_KEYS = [NAV_ORDER_KEY, "haus.cryptoWalletOrder"];

/** Per-browser display preferences: text size, default chart window, privacy blur, layout order. */
export function DisplayPrefs() {
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [privacy, setPrivacyState] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRange(storedDefaultRange() ?? DEFAULT_RANGE);
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

      <PrefRow label="Blur balances" hint="Figures blur until hovered. Handy on a shared screen.">
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
