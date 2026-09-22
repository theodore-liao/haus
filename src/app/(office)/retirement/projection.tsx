"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/money";
import { formatMoney } from "@/lib/format";
import type { ProjectionPrefs } from "@/lib/projection-prefs";

export type Holder = { key: "A" | "B"; name: string; birthdate: string | null };

const AXIS = { fontSize: 11, fill: "#8fa0b8", fontFamily: "var(--font-geist-sans)" };
const MONEY_AXIS = { ...AXIS, className: "money" };
const GRID = "rgba(148,163,184,0.12)";
const BALANCE = "#D4BE7A";
const PRINCIPAL = "#7EABD4";

function ageOn(birthdate: string, at: Date) {
  const b = new Date(`${birthdate}T00:00:00Z`);
  return (at.getTime() - b.getTime()) / (365.25 * 86400000);
}

type Point = { year: number; age: number | null; balance: number; principal: number };

/** Annual compounding from today; contributions land at year end. */
function project(
  start: number,
  rate: number,
  contribution: number,
  years: number,
  ageNow: number | null,
  startYear: number,
): Point[] {
  const now = startYear;
  const pts: Point[] = [{ year: now, age: ageNow, balance: start, principal: start }];
  let balance = start;
  let principal = start;
  for (let i = 1; i <= years; i++) {
    balance = balance * (1 + rate) + contribution;
    principal += contribution;
    pts.push({ year: now + i, age: ageNow == null ? null : ageNow + i, balance, principal });
  }
  return pts;
}

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card-elevated px-3 py-2 text-xs">
      <div className="mb-1 text-muted-foreground">
        {p.year}
        {p.age != null ? ` · age ${Math.round(p.age)}` : ""}
      </div>
      <div className="num">Balance: <span className="money">{formatMoney(p.balance)}</span></div>
      <div className="num">Contributed: <span className="money">{formatMoney(p.principal)}</span></div>
      <div className="num">Growth: <span className="money">{formatMoney(p.balance - p.principal)}</span></div>
    </div>
  );
}

/** Text inputs commit on Enter (or blur), so the chart doesn't thrash while a number is being typed. */
function Field({
  label,
  value,
  onCommit,
  suffix,
  width = "w-28",
  money = false,
}: {
  label: string;
  value: string;
  onCommit: (raw: string) => void;
  suffix?: string;
  width?: string;
  money?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  // Reflect clamping done by the parent (e.g. retire age below current age).
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setDraft(value);
  }
  function keydown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit(draft);
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setDraft(value);
    }
  }
  return (
    <div>
      <Label className="kicker">{label}</Label>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Input
          inputMode="decimal"
          className={`h-8 ${width} num text-sm${money ? " money" : ""}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={keydown}
          onBlur={() => onCommit(draft)}
        />
        {suffix ? <span className="text-xs text-muted-foreground">{suffix}</span> : null}
      </div>
    </div>
  );
}

function num(raw: string, fallback: number) {
  const n = Number(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function persist(patch: ProjectionPrefs) {
  void fetch("/api/household", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectionPrefs: patch }),
  });
}

export function RetirementProjection({
  balance,
  defaultContribution,
  holders,
  today,
  saved,
}: {
  balance: number;
  /** Annualised contribution inferred from this year's flows; the household can override it. */
  defaultContribution: number;
  holders: Holder[];
  today: string;
  saved: ProjectionPrefs;
}) {
  const withDob = holders.filter((h) => h.birthdate);
  const [holderKey, setHolderKey] = useState<"A" | "B">(
    saved.holderKey && withDob.some((h) => h.key === saved.holderKey)
      ? saved.holderKey
      : (withDob[0]?.key ?? "A"),
  );
  const [rate, setRate] = useState(saved.rate ?? 7);
  const [contribution, setContribution] = useState(
    saved.contribution != null ? saved.contribution : Math.max(0, Math.round(defaultContribution)),
  );
  const [retireAge, setRetireAge] = useState(saved.retireAge ?? 65);
  const [yearsFallback, setYearsFallback] = useState(saved.yearsFallback ?? 30);

  const todayDate = new Date(`${today}T00:00:00Z`);
  const holder = holders.find((h) => h.key === holderKey) ?? holders[0];
  const ageNow = holder?.birthdate ? ageOn(holder.birthdate, todayDate) : null;
  const years = ageNow == null ? yearsFallback : Math.max(0, Math.round(retireAge - ageNow));

  const startYear = todayDate.getUTCFullYear();
  const points = useMemo(
    () => project(balance, rate / 100, contribution, Math.min(70, years), ageNow, startYear),
    [balance, rate, contribution, years, ageNow, startYear],
  );
  const end = points[points.length - 1];
  const tickEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <Field
          label="Growth"
          value={String(rate)}
          suffix="% / yr"
          width="w-16"
          onCommit={(v) => {
            const next = num(v, rate);
            setRate(next);
            persist({ rate: next });
          }}
        />
        <Field
          label="Contribution"
          value={String(contribution)}
          suffix="$ / yr"
          money
          onCommit={(v) => {
            const next = Math.max(0, num(v, contribution));
            setContribution(next);
            persist({ contribution: next });
          }}
        />
        {ageNow == null ? (
          <Field
            label="Years"
            value={String(yearsFallback)}
            width="w-16"
            onCommit={(v) => {
              const next = Math.max(1, Math.min(70, Math.round(num(v, yearsFallback))));
              setYearsFallback(next);
              persist({ yearsFallback: next });
            }}
          />
        ) : (
          <Field
            label="Retire at"
            value={String(retireAge)}
            width="w-16"
            onCommit={(v) => {
              const next = Math.max(Math.ceil(ageNow) + 1, Math.round(num(v, retireAge)));
              setRetireAge(next);
              persist({ retireAge: next });
            }}
          />
        )}
        {withDob.length > 1 ? (
          <div>
            <Label className="kicker">Whose age</Label>
            <div className="mt-1.5 flex gap-1">
              {withDob.map((h) => (
                <button
                  key={h.key}
                  type="button"
                  onClick={() => {
                    setHolderKey(h.key);
                    persist({ holderKey: h.key });
                  }}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    h.key === holderKey ? "border-primary text-foreground" : "border-border text-muted-foreground"
                  }`}
                >
                  {h.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3">
        <span className="display-number">
          <Money value={end.balance} />
        </span>
        <span className="text-sm text-muted-foreground">
          in {end.year}
          {ageNow != null ? ` at ${holder.name}'s age ${Math.round(end.age ?? retireAge)}` : ""} ·{" "}
          <Money value={end.balance - end.principal} /> of it growth
        </span>
      </div>
      {ageNow == null ? (
        <p className="footnote mt-1">
          Add birthdates in <Link href="/settings" className="underline">Settings</Link> to project to a retirement age
          instead of a number of years.
        </p>
      ) : null}

      <div className="mt-3 min-h-60 w-full flex-1">
        <ResponsiveContainer>
          <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="proj-bal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BALANCE} stopOpacity={0.4} />
                <stop offset="100%" stopColor={BALANCE} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="proj-pri" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PRINCIPAL} stopOpacity={0.35} />
                <stop offset="100%" stopColor={PRINCIPAL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="year" tick={AXIS} axisLine={false} tickLine={false} interval={tickEvery - 1} />
            <YAxis
              tick={MONEY_AXIS}
              axisLine={false}
              tickLine={false}
              width={64}
              tickFormatter={(v) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)}
            />
            <Tooltip content={<Tip />} />
            <Area type="monotone" dataKey="balance" name="Balance" stroke={BALANCE} fill="url(#proj-bal)" strokeWidth={2} />
            <Area
              type="monotone"
              dataKey="principal"
              name="Contributed"
              stroke={PRINCIPAL}
              fill="url(#proj-pri)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="footnote mt-2">
        Gold: projected balance. Blue: what you will have put in. Nominal dollars, annual compounding, contributions
        held flat.
      </p>
    </div>
  );
}
