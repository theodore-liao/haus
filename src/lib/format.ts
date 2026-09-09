import { format } from "date-fns";

export function formatMoney(
  n: number | null | undefined,
  opts?: { signed?: boolean },
): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const body = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  if (opts?.signed) {
    if (n > 0) return `+${body}`;
    if (n < 0) return `-${body}`;
    return body;
  }
  return n < 0 ? `-${body}` : body;
}

export function formatPct(
  n: number | null | undefined,
  digits = 1,
  signed = true,
): string {
  if (n == null || Number.isNaN(n)) return "—";
  const body = `${Math.abs(n).toFixed(digits)}%`;
  if (!signed) return body;
  if (n > 0) return `+${body}`;
  if (n < 0) return `-${body}`;
  return body;
}

const CLASS_LABELS: Record<string, string> = {
  etf: "ETF",
  "etfs": "ETF",
  "mutual fund": "Mutual Fund",
  "mutual_fund": "Mutual Fund",
  equity: "Equity",
  cash: "Cash",
  cryptocurrency: "Cryptocurrency",
  crypto: "Crypto",
  derivative: "Derivative",
  loan: "Loan",
  "fixed income": "Fixed Income",
  "fixed_income": "Fixed Income",
  other: "Other",
  defi: "DeFi",
};

export function formatHoldingClass(raw: string | null | undefined): string {
  if (!raw) return "—";
  const key = raw.trim().toLowerCase().replace(/_/g, " ");
  if (CLASS_LABELS[key]) return CLASS_LABELS[key];
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "d MMM yyyy");
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "Never";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "Never";
  return format(date, "d MMM yyyy HH:mm");
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function monthKey(d: Date) {
  return format(d, "yyyy-MM");
}

export function parseMonthKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}
