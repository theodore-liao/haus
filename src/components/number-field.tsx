"use client";

import { useId, useState, type ReactNode } from "react";
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

type Parsed = { ok: true; value: number | null } | { ok: false; error: string };

type Rules = {
  min?: number;
  max?: number;
  integer?: boolean;
  allowBlank?: boolean;
  /** What the box holds, so "7%" in a dollar box or "$7" in a percent box is caught. */
  unit?: "money" | "percent";
  /** Thousands separators in messages; off for years and ages, so "Use 1900 or more", not "1,900". */
  grouping?: boolean;
};

/**
 * Reads what a person types: "$1,000", "7%", " 12 " all work. Blank is null. Unreadable is undefined, including a
 * European "1.234,56" (a comma after the decimal point) and anything that isn't a plain decimal, such as "0x1F".
 */
export function parseTyped(raw: string): number | null | undefined {
  if (/\.\d*,/.test(raw)) return undefined;
  const t = raw.replace(/[$,%\s]/g, "");
  if (!t) return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

// Whether a mouse button or finger is down anywhere on the page. Leaving a box by clicking applies it only after that
// click lands: applying can change the text under the box and move what was clicked, and the click would miss.
let pointerDown = false;
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", () => (pointerDown = true), true);
  document.addEventListener("pointerup", () => setTimeout(() => (pointerDown = false), 0), true);
  document.addEventListener("pointercancel", () => (pointerDown = false), true);
}
function afterClick(run: () => void) {
  if (!pointerDown) return run();
  // The click event follows pointerup in the same step, so a zero delay after pointerup runs once it has landed.
  // If the button is let go outside the window, pointerup never comes; apply anyway a moment later.
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    run();
  };
  document.addEventListener("pointerup", () => setTimeout(once, 0), { once: true, capture: true });
  setTimeout(once, 1500);
}

export function checkTyped(raw: string, rules: Rules): Parsed {
  if (rules.unit === "money" && raw.includes("%")) return { ok: false, error: "Enter a dollar amount." };
  if (rules.unit === "percent" && raw.includes("$")) return { ok: false, error: "Enter a percent." };
  const n = parseTyped(raw);
  if (n === undefined) return { ok: false, error: "Enter a number." };
  if (n === null) return rules.allowBlank ? { ok: true, value: null } : { ok: false, error: "Enter a number." };
  if (rules.integer && !Number.isInteger(n)) return { ok: false, error: "Use a whole number." };
  // The box shows two decimals at most, so that is all that applies: what you see is what the plan uses.
  const shown = Math.round(n * 100) / 100;
  const { min, max } = rules;
  const group = rules.grouping !== false;
  if (min != null && shown < min) return { ok: false, error: `Use ${fmt(min, group)} or more.` };
  if (max != null && shown > max) return { ok: false, error: `Use ${fmt(max, group)} or less.` };
  return { ok: true, value: shown };
}

function fmt(n: number, grouping = true) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, useGrouping: grouping }).format(n);
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
  info,
}: {
  label?: string;
  /** A longer explanation behind a "?" beside the label; keep `help` to one short line. */
  info?: ReactNode;
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
  // The value changed from outside: another control, or the page adjusting what this box just applied (rounding it, say).
  // Show it, unless the person has typed something here that they haven't applied yet.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!focused || draft === format(seen)) {
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
    grouping: group,
  };
  const pending = focused && !error && draft !== format(value);
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
        <div className="flex min-h-6 items-center gap-1">
          <label htmlFor={id} className="kicker">
            {label}
          </label>
          {info ? <InfoTip label={`About ${label.toLowerCase()}`}>{info}</InfoTip> : null}
        </div>
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
            afterClick(apply);
          }}
          aria-describedby={pending ? `${id}-hint` : undefined}
        />
        {/* Inside the box, so the help underneath stays put while typing and nothing below it moves. */}
        {pending ? (
          <span id={`${id}-hint`} className="field-hint">
            <span aria-hidden>↵</span> Enter to apply
          </span>
        ) : null}
        {suffix ? <span className="field-affix">{suffix}</span> : null}
      </div>
      {error ? (
        <p className="field-note" data-error="">
          {error}
        </p>
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
    <div
      className="segmented"
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        // Arrow keys move the choice, as they do in any radio group.
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const at = options.findIndex((o) => o.value === value);
        const next = options[(at + step + options.length) % options.length];
        onChange(next.value);
        const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>("button");
        buttons[options.indexOf(next)]?.focus();
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
