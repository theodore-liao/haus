"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Money } from "@/components/money";
import { NumberField, Segmented } from "@/components/number-field";

type Billing = "monthly" | "annual";

/**
 * An optional premium under a card: a quiet line when set, a small button when not. Nothing asks for it.
 * Monthly or Yearly is a draft until the amount is applied (Enter or leaving the box) or the popover closes, so
 * flipping it never silently turns a monthly premium into a yearly one of the same amount.
 */
export function PremiumControl({
  policyId,
  premium,
  billingFrequency,
}: {
  policyId: string;
  premium: number | null;
  billingFrequency: string | null;
}) {
  const router = useRouter();
  const initialBilling: Billing = billingFrequency?.startsWith("month") ? "monthly" : "annual";
  const [saved, setSaved] = useState<{ premium: number | null; billing: Billing }>({ premium, billing: initialBilling });
  const [draft, setDraft] = useState<Billing>(initialBilling);
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  async function save(p: number | null, b: Billing) {
    // Removing the premium puts the choice back to Monthly for next time.
    const billing: Billing = p == null ? "monthly" : b;
    const previous = saved;
    setSaved({ premium: p, billing });
    setDraft(billing);
    const res = await fetch("/api/insurance/policies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: policyId, premium: p, billingFrequency: billing }),
    }).catch(() => null);
    if (!res?.ok) {
      setSaved(previous);
      setDraft(previous.billing);
      toast.error("Could not save the premium.");
      return;
    }
    router.refresh();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Closing is leaving: a changed Monthly or Yearly applies to the amount already saved.
        if (!next && draft !== saved.billing && saved.premium != null) void save(saved.premium, draft);
        if (next) setDraft(saved.billing);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground">
          {saved.premium != null && saved.premium > 0 ? (
            <span className="prose-num">
              <Money value={saved.premium} /> {saved.billing === "monthly" ? "a month" : "a year"}
            </span>
          ) : (
            "Add premium"
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        side="bottom"
        className="w-64 space-y-3"
        onOpenAutoFocus={(e) => {
          // Start in the amount box, so typing and pressing Enter is all it takes.
          e.preventDefault();
          contentRef.current?.querySelector<HTMLInputElement>("input")?.focus();
        }}
      >
        <Segmented
          label="How often"
          value={draft}
          onChange={setDraft}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "annual", label: "Yearly" },
          ]}
        />
        <NumberField
          label="Premium"
          value={saved.premium}
          onValue={(v) => {
            void save(v, draft);
            setOpen(false);
          }}
          prefix="$"
          money
          min={0}
          allowBlank
          help="Enter saves. Blank removes it."
        />
      </PopoverContent>
    </Popover>
  );
}
