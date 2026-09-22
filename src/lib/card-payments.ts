import { prisma } from "./db";

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
};

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
  if (household?.pairCardPayments === false) {
    const flags = { enabled: false, paired: new Set<string>() };
    globalCache.hausTransferMatch = { at: Date.now(), flags };
    return flags;
  }
  const txns = await prisma.txn.findMany({
    select: { id: true, accountId: true, amount: true, date: true },
  });
  const flags = { enabled: true, paired: classifyTransfers(txns) };
  globalCache.hausTransferMatch = { at: Date.now(), flags };
  return flags;
}
