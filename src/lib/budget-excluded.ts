// Charges the household left out of budgets, by the bank's transaction id so a row keeps it after moving to saved
// history. One Setting row; no schema change.
import { prisma } from "./db";

const KEY = "budgetExcluded";
const MAX = 5000;

export async function readBudgetExcluded(): Promise<Set<string>> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: KEY } });
    const ids: unknown = row ? JSON.parse(row.value) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

async function writeBudgetExcluded(ids: Set<string>) {
  const value = JSON.stringify([...ids].slice(-MAX));
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

export async function setBudgetExcluded(id: string, excluded: boolean) {
  const ids = await readBudgetExcluded();
  if (excluded) ids.add(id);
  else ids.delete(id);
  await writeBudgetExcluded(ids);
}

/**
 * A pending charge posts under a new bank id. The exclusion follows that id, the same way a
 * category or note does, so the posted charge stays out of the budget.
 */
export async function moveBudgetExcluded(fromId: string, toId: string) {
  if (!fromId || !toId || fromId === toId) return;
  const ids = await readBudgetExcluded();
  if (!ids.has(fromId)) return;
  ids.delete(fromId);
  ids.add(toId);
  await writeBudgetExcluded(ids);
}
