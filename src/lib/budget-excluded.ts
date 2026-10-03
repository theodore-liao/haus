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

export async function setBudgetExcluded(id: string, excluded: boolean) {
  const ids = await readBudgetExcluded();
  if (excluded) ids.add(id);
  else ids.delete(id);
  const value = JSON.stringify([...ids].slice(-MAX));
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}
