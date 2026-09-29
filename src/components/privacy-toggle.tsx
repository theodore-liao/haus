"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "./ui/button";
import { onPrivacyChange, setPrivacy, storedPrivacy } from "@/lib/prefs";

/** One-click switch for the dollar blur. */
export function PrivacyToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(storedPrivacy());
    return onPrivacyChange(setOn);
  }, []);

  const label = on ? "Show balances" : "Blur balances";
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-8 w-8"
      onClick={() => setPrivacy(!on)}
      aria-label={label}
      aria-pressed={on}
      title={label}
    >
      {on ? <EyeOff /> : <Eye />}
    </Button>
  );
}
