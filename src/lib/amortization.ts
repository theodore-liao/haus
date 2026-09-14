/** Standard fully-amortizing mortgage math from today's remaining principal. */

export type AmortMonth = {
  i: number;
  year: number;
  principal: number;
  interest: number;
  extra: number;
  balance: number;
};

export type AmortYear = {
  year: number;
  principal: number;
  interest: number;
  extra: number;
  endBalance: number;
};

export type AmortSummary = {
  monthlyPi: number;
  remainingMonths: number;
  payoff: Date;
  interestRemaining: number;
  principalRemaining: number;
  months: AmortMonth[];
  years: AmortYear[];
};

export function monthlyRate(aprPct: number) {
  if (!Number.isFinite(aprPct) || aprPct <= 0) return 0;
  return aprPct / 100 / 12;
}

export function monthsBetween(from: Date, to: Date) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function remainingFromOrigination(originalTermMonths: number, origination: Date, asOf = new Date()) {
  return Math.max(0, originalTermMonths - monthsBetween(origination, asOf));
}

export function monthlyPi(principal: number, aprPct: number, n: number) {
  if (principal <= 0 || n <= 0) return 0;
  const r = monthlyRate(aprPct);
  if (r === 0) return principal / n;
  const g = Math.pow(1 + r, n);
  return (principal * r * g) / (g - 1);
}

/** P&I is the lender payment minus escrow and PMI. Extra principal is on top of this. */
export function piFromPayment(monthlyPayment: number, escrowAndPmi: number) {
  return Math.max(0, monthlyPayment - Math.max(0, escrowAndPmi));
}

/** Solve remaining months from remaining principal, APR, and monthly P&I. */
export function remainingFromPayment(principal: number, aprPct: number, payment: number) {
  if (principal <= 0 || payment <= 0) return 0;
  const r = monthlyRate(aprPct);
  if (r === 0) return Math.ceil(principal / payment);
  const cover = payment - principal * r;
  if (cover <= 1e-8) return 0;
  const n = Math.log(payment / cover) / Math.log(1 + r);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(720, Math.ceil(n - 1e-9));
}

export function addMonths(d: Date, n: number) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setMonth(x.getMonth() + n);
  return x;
}

export function isoMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Original loan amount from today's remaining balance after `elapsed` payments of an `originalN`-month loan. */
export function originalPrincipal(remaining: number, aprPct: number, originalN: number, elapsed: number) {
  if (remaining <= 0) return 0;
  if (elapsed <= 0) return remaining;
  const N = Math.max(elapsed + 1, originalN);
  const r = monthlyRate(aprPct);
  if (r === 0) return remaining * N / Math.max(1, N - elapsed);
  const gN = Math.pow(1 + r, N);
  const gk = Math.pow(1 + r, elapsed);
  const den = gN - gk;
  if (den <= 1e-12) return remaining;
  return remaining * (gN - 1) / den;
}

export function amortize(opts: {
  principal: number;
  aprPct: number;
  remainingMonths: number;
  extraPrincipal?: number;
  start?: Date;
}): AmortSummary | null {
  const principal = Math.max(0, opts.principal);
  const n = Math.max(0, Math.round(opts.remainingMonths));
  const extra = Math.max(0, opts.extraPrincipal ?? 0);
  if (principal <= 0 || n <= 0) return null;
  const pi = monthlyPi(principal, opts.aprPct, n);
  const r = monthlyRate(opts.aprPct);
  const start = opts.start ?? new Date();
  const months: AmortMonth[] = [];
  let bal = principal;
  let i = 0;
  while (bal > 0.5 && i < 720) {
    const interest = bal * r;
    const scheduledPrin = Math.max(0, pi - interest);
    const prin = Math.min(bal, scheduledPrin + extra);
    const extraApplied = Math.max(0, prin - scheduledPrin);
    bal = Math.max(0, bal - prin);
    const when = addMonths(start, i);
    months.push({
      i,
      year: when.getFullYear(),
      principal: scheduledPrin,
      interest,
      extra: extraApplied,
      balance: bal,
    });
    i += 1;
  }
  const byYear = new Map<number, AmortYear>();
  for (const m of months) {
    const row = byYear.get(m.year) ?? {
      year: m.year,
      principal: 0,
      interest: 0,
      extra: 0,
      endBalance: m.balance,
    };
    row.principal += m.principal;
    row.interest += m.interest;
    row.extra += m.extra;
    row.endBalance = m.balance;
    byYear.set(m.year, row);
  }
  return {
    monthlyPi: pi,
    remainingMonths: months.length,
    payoff: addMonths(start, Math.max(0, months.length - 1)),
    interestRemaining: months.reduce((s, m) => s + m.interest, 0),
    principalRemaining: principal,
    months,
    years: [...byYear.values()],
  };
}

export function yearLabel(d: Date) {
  return `${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()}`;
}

/** Escrow is taxes + insurance in one monthly number (optional PMI on top). */
export function housingEscrow(opts: {
  taxAnnual?: number | null;
  insuranceAnnual?: number | null;
  escrowMonthly?: number | null;
  pmiMonthly?: number | null;
}) {
  const stated = opts.escrowMonthly;
  const fromAnnual = ((opts.taxAnnual ?? 0) + (opts.insuranceAnnual ?? 0)) / 12;
  const escrow = stated != null && stated > 0 ? stated : fromAnnual;
  const pmi = Math.max(0, opts.pmiMonthly ?? 0);
  return { escrow, pmi, escrowAndPmi: escrow + pmi };
}
