"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Parsed = { ok: true; value: number | null } | { ok: false; error: string };

type Rules = {
  min?: number;
  max?: number;
  integer?: boolean;
  allowBlank?: boolean;
  /** What the box holds, so "7%" in a dollar box or "$7" in a percent box is caught. */
  unit?: "money" | "percent";
};

/** Reads what a person types: "$1,000", "7%", " 12 " all work. Blank is null. Unreadable is undefined. */
export function parseTyped(raw: string): number | null | undefined {
  const t = raw.replace(/[$,%\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function checkTyped(raw: string, rules: Rules): Parsed {
  if (rules.unit === "money" && raw.includes("%")) return { ok: false, error: "Enter a dollar amount." };
  if (rules.unit === "percent" && raw.includes("$")) return { ok: false, error: "Enter a percent." };
  const n = parseTyped(raw);
  if (n === undefined) return { ok: false, error: "Enter a number." };
  if (n === null) return rules.allowBlank ? { ok: true, value: null } : { ok: false, error: "Enter a number." };
  if (rules.integer && !Number.isInteger(n)) return { ok: false, error: "Use a whole number." };
  const { min, max } = rules;
  if (min != null && n < min) return { ok: false, error: `Use ${fmt(min)} or more.` };
  if (max != null && n > max) return { ok: false, error: `Use ${fmt(max)} or less.` };
  return { ok: true, value: n };
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function show(value: number | null, grouping: boolean, money: boolean) {
  if (value == null) return "";
  const cents = money && !Number.isInteger(Math.round(value * 100) / 100);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: 2,
    useGrouping: grouping,
  }).format(value);
}

/**
 * A labeled number box. `$` or `%` sits inside the box. What you type applies when you press Enter or leave the box,
 * so results never jump mid-typing. Escape puts the box back. Something unusable says why underneath and is never applied.
 */
export function NumberField({
  label,
  value,
  onValue,
  prefix,
  suffix,
  min,
  max,
  integer,
  allowBlank,
  grouping,
  money,
  placeholder,
  help,
  className,
  ariaLabel,
}: {
  label?: string;
  value: number | null;
  onValue: (value: number | null) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  /** Blank is allowed and means none. */
  allowBlank?: boolean;
  /** Thousands separators. On for dollar amounts, off for years and ages. */
  grouping?: boolean;
  /** Dollar amount: blurred in privacy mode. */
  money?: boolean;
  placeholder?: string;
  help?: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const id = useId();
  const group = grouping ?? Boolean(money);
  const format = (v: number | null) => show(v, group, Boolean(money));
  const [draft, setDraft] = useState(() => format(value));
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  // Another control changed this value (a shared input elsewhere on the page): show it unless the person is typing here.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!focused) {
      setDraft(format(value));
      setError(null);
    }
  }

  const rules: Rules = {
    min,
    max,
    integer,
    allowBlank,
    unit: money ? "money" : suffix?.includes("%") ? "percent" : undefined,
  };
  /** Apply the box: a usable entry goes to the page and is shown formatted; anything else stays with its message. */
  const apply = () => {
    const r = checkTyped(draft, rules);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setDraft(format(r.value));
    setSeen(r.value);
    if (r.value !== value) onValue(r.value);
  };

  return (
    <div className={cn("field", className)}>
      {label ? (
        <label htmlFor={id} className="kicker">
          {label}
        </label>
      ) : null}
      <div className="field-box" data-invalid={error ? "" : undefined} onClick={(e) => e.currentTarget.querySelector("input")?.focus()}>
        {prefix ? <span className="field-affix">{prefix}</span> : null}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          aria-label={label ? undefined : ariaLabel}
          aria-invalid={error ? true : undefined}
          className={money ? "money" : undefined}
          placeholder={placeholder}
          value={draft}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            setDraft(e.target.value);
            // A message that no longer applies clears as you fix it; nothing is applied until Enter or leaving the box.
            if (error && checkTyped(e.target.value, rules).ok) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            } else if (e.key === "Escape") {
              setDraft(format(value));
              setError(null);
            }
          }}
          onBlur={() => {
            setFocused(false);
            apply();
          }}
        />
        {suffix ? <span className="field-affix">{suffix}</span> : null}
      </div>
      {error ? (
        <p className="field-note" data-error="">
          {error}
        </p>
      ) : focused && draft !== format(value) ? (
        <p className="field-note">Press Enter to apply.</p>
      ) : help ? (
        <p className="field-note">{help}</p>
      ) : null}
    </div>
  );
}

/** Pick one of a few options. Same look everywhere. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
