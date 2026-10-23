import { prisma } from "./db";
import { effectiveCategory, isCreditCardPayment, isTransferCategory, recurringMerchantKey } from "./categories";

const WINDOW_DAYS = 5;
const CACHE_MS = 20_000;

type PairTxn = {
  id: string;
  accountId: string;
  amount: number;
  date: Date;
};

export type TransferMatchFlags = {
  enabled: boolean;
  paired: Set<string>;
  /** Money back from a shop, by transaction id, with the category of the purchase it reverses. */
  refunds: Map<string, string>;
};

export type RefundTxn = PairTxn & {
  name: string;
  merchantName: string | null;
  userMerchant: string | null;
  userCategory: string | null;
  categoryPrimary: string | null;
  categoryDetailed: string | null;
  isTransfer: boolean;
  isCcPayment: boolean;
};

/** Payment apps: money back there is usually a person paying you, not a shop. */
const PAYMENT_APP = /\b(venmo|zelle|paypal|cash ?app|square cash|apple cash|google pay)\b/;
/** Wording that says a credit is pay, whatever category the bank gave it. */
const PAY_WORDS = /\b(payroll|salary|paycheck|wages|direct dep(osit)?|dir dep)\b/;
/** How far back the purchase a credit reverses can be. */
const REFUND_LOOKBACK_DAYS = 548;

function merchantKeys(t: Pick<RefundTxn, "name" | "merchantName" | "userMerchant">) {
  return [t.userMerchant, t.merchantName, t.name].map((v) => recurringMerchantKey(v)).filter(Boolean);
}

/**
 * Credits that are money back from a shop: a credit on an account where the same merchant charged at least as much
 * before (within 18 months). Plaid sometimes files these as a transfer in, a card payment, or other income, and an
 * unrelated payment of the same amount elsewhere can look like the other half of a transfer; a merchant the household
 * paid on this account is neither. A category the household chose wins, pay and interest are never refunds, and payment
 * apps are left out. A credit bigger than everything bought there (pay from an employer the household also shops at)
 * is not money back. Returns each refund's id with the category of the purchase it reverses.
 */
export function merchantRefunds(txns: RefundTxn[]): Map<string, string> {
  const purchases = new Map<string, { at: number; amount: number; category: string }[]>();
  for (const t of txns) {
    if (!(t.amount > 0) || t.isTransfer || isCreditCardPayment(t)) continue;
    const category = effectiveCategory(t);
    if (isTransferCategory(category) || category === "INCOME") continue;
    for (const key of merchantKeys(t)) {
      const list = purchases.get(`${t.accountId}|${key}`) ?? [];
      list.push({ at: utcDay(t.date), amount: t.amount, category });
      purchases.set(`${t.accountId}|${key}`, list);
    }
  }
  const out = new Map<string, string>();
  for (const t of txns) {
    if (!(t.amount < 0) || t.userCategory) continue;
    const detailed = (t.categoryDetailed ?? "").toUpperCase();
    if (detailed.startsWith("INCOME_") && detailed !== "INCOME_OTHER_INCOME") continue;
    const keys = merchantKeys(t);
    if (keys.some((key) => PAYMENT_APP.test(key) || PAY_WORDS.test(key))) continue;
    const at = utcDay(t.date);
    // The merchant name that bought the most there in the window, and its latest purchase.
    let best: { spent: number; latest: { at: number; category: string } } | null = null;
    for (const key of keys) {
      let spent = 0;
      let latest: { at: number; category: string } | null = null;
      for (const p of purchases.get(`${t.accountId}|${key}`) ?? []) {
        if (p.at > at || at - p.at > REFUND_LOOKBACK_DAYS * 86_400_000) continue;
        spent += p.amount;
        if (!latest || p.at > latest.at) latest = p;
      }
      if (latest && (!best || spent > best.spent)) best = { spent, latest };
    }
    if (best && -t.amount <= best.spent + 0.5) out.set(t.id, best.latest.category);
  }
  return out;
}

const globalCache = globalThis as unknown as { hausTransferMatch?: { at: number; flags: TransferMatchFlags } };

export function clearCardPaymentCache() {
  globalCache.hausTransferMatch = undefined;
}

function utcDay(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function daysApart(a: Date, b: Date) {
  return Math.abs(utcDay(a) - utcDay(b)) / 86_400_000;
}

/**
 * Pair an outflow on one linked account with an inflow of the same amount on
 * another. A pair is kept only when each side has exactly one candidate.
 */
export function classifyTransfers(txns: PairTxn[]): Set<string> {
  const insByCents = new Map<number, PairTxn[]>();
  for (const t of txns) {
    if (!(t.amount < 0)) continue;
    const cents = Math.round(Math.abs(t.amount) * 100);
    const list = insByCents.get(cents) ?? [];
    list.push(t);
    insByCents.set(cents, list);
  }

  const outToIn = new Map<string, string[]>();
  const inToOut = new Map<string, string[]>();
  for (const o of txns) {
    if (!(o.amount > 0)) continue;
    const candidates = (insByCents.get(Math.round(o.amount * 100)) ?? []).filter(
      (i) => i.accountId !== o.accountId && daysApart(o.date, i.date) <= WINDOW_DAYS,
    );
    outToIn.set(o.id, candidates.map((i) => i.id));
    for (const i of candidates) {
      const backs = inToOut.get(i.id) ?? [];
      backs.push(o.id);
      inToOut.set(i.id, backs);
    }
  }

  const paired = new Set<string>();
  for (const [outId, ins] of outToIn) {
    if (ins.length === 1 && (inToOut.get(ins[0]) ?? []).length === 1) {
      paired.add(outId);
      paired.add(ins[0]);
    }
  }
  return paired;
}

export async function loadCardPaymentFlags(): Promise<TransferMatchFlags> {
  const cached = globalCache.hausTransferMatch;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.flags;
  const household = await prisma.household.findUnique({
    where: { id: "haus" },
    select: { pairCardPayments: true },
  });
  const txns = await prisma.txn.findMany({
    select: {
      id: true,
      accountId: true,
      amount: true,
      date: true,
      name: true,
      merchantName: true,
      userMerchant: true,
      userCategory: true,
      categoryPrimary: true,
      categoryDetailed: true,
      isTransfer: true,
      isCcPayment: true,
    },
  });
  const refunds = merchantRefunds(txns);
  if (household?.pairCardPayments === false) {
    const flags = { enabled: false, paired: new Set<string>(), refunds };
    globalCache.hausTransferMatch = { at: Date.now(), flags };
    return flags;
  }
  // A refund is never half of a transfer, however its amount lines up with a payment elsewhere.
  const flags = { enabled: true, paired: classifyTransfers(txns.filter((t) => !refunds.has(t.id))), refunds };
  globalCache.hausTransferMatch = { at: Date.now(), flags };
  return flags;
}
