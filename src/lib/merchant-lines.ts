import { ESPP_LABEL, VEST_LABEL } from "./equity-comp";
import { TO_INVESTMENTS } from "./flow-labels";
import type { BrandKind } from "./logos";
import { OUTSIDE_DEPOSIT_LABEL, RETIREMENT_CONTRIBUTION_LABEL } from "./outside-deposits";
import type { TxnRow } from "./txn-row";

/** One vest, purchase, or deposit that is not a bank transaction. */
export type FlowEvent = {
  id: string;
  date: string;
  amount: number;
  /** What the money bought, such as "VANG 500 INDEX TRUST". */
  detail?: string;
};

export type MerchantLine = {
  category: string;
  merchant: string;
  amount: number;
  txns?: TxnRow[];
  /** Dates behind a line that has no bank transaction, such as a vest or a retirement deposit. */
  events?: FlowEvent[];
  /** Bank whose logo goes beside the merchant, when the merchant is an account. */
  logo?: string;
};

function countWord(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** What one expanded line's dates are called. */
export function eventNoun(title: string, merchant: string, n: number) {
  if (title === VEST_LABEL || merchant.startsWith(`${VEST_LABEL}:`)) return n === 1 ? "vest" : "vests";
  if (title === ESPP_LABEL || merchant.startsWith("ESPP:")) return n === 1 ? "purchase" : "purchases";
  if (title === OUTSIDE_DEPOSIT_LABEL) return n === 1 ? "deposit" : "deposits";
  return n === 1 ? "contribution" : "contributions";
}

/** The line under the dialog title: one source lists its dates, several sources list the sources. */
export function breakdownSummary(title: string, lines: MerchantLine[]) {
  const onlyEvents = lines.length > 0 && lines.every((line) => line.events?.length && !line.txns?.length);
  if (lines.length === 1 && lines[0].txns?.length) return countWord(lines[0].txns.length, "charge", "charges");
  if (lines.length === 1 && onlyEvents) {
    const n = lines[0].events!.length;
    return `${n} ${eventNoun(title, lines[0].merchant, n)}`;
  }
  if (onlyEvents && title === RETIREMENT_CONTRIBUTION_LABEL) return countWord(lines.length, "account", "accounts");
  if (onlyEvents && (title === VEST_LABEL || title === ESPP_LABEL)) return countWord(lines.length, "stock", "stocks");
  if (onlyEvents && title === TO_INVESTMENTS) return investmentSummary(lines);
  return countWord(lines.length, "merchant", "merchants");
}

function investmentSummary(lines: MerchantLine[]) {
  const stocks = lines.filter((line) => line.merchant.startsWith("ESPP:") || line.merchant.startsWith(`${VEST_LABEL}:`)).length;
  const accounts = lines.length - stocks;
  if (stocks && accounts) return `${lines.length} accounts and stocks`;
  if (stocks) return countWord(lines.length, "stock", "stocks");
  return countWord(lines.length, "account", "accounts");
}

/** The name shown on a line. Stock and account prefixes stay in the data and come off the label. */
export function lineLabel(line: MerchantLine, title?: string): { name: string; aside?: string; mark: string; kind: BrandKind } {
  const vest = `${VEST_LABEL}: `;
  if (line.merchant.startsWith(vest)) {
    const name = line.merchant.slice(vest.length);
    return { name, mark: name, kind: "security" };
  }
  if (line.merchant.startsWith("ESPP: ")) {
    const name = line.merchant.slice("ESPP: ".length);
    return { name, ...(title === ESPP_LABEL ? {} : { aside: "ESPP" }), mark: name, kind: "security" };
  }
  if (line.logo && line.merchant.startsWith(`${line.logo}: `)) {
    return {
      name: line.merchant.slice(line.logo.length + 2),
      aside: line.logo,
      mark: line.logo,
      kind: "institution",
    };
  }
  if (line.logo) return { name: line.merchant, mark: line.logo, kind: "institution" };
  return { name: line.merchant, mark: line.merchant, kind: "merchant" };
}

export function aggregateMerchants(lines: MerchantLine[], category: string | null, extras?: string[]) {
  const allow = category == null ? null : new Set([category, ...(extras ?? [])]);
  const map: Record<string, number> = {};
  for (const l of lines) {
    if (allow && !allow.has(l.category)) continue;
    map[l.merchant] = (map[l.merchant] ?? 0) + l.amount;
  }
  return Object.entries(map).map(([merchant, amount]) => ({ category: category ?? "All", merchant, amount }));
}
