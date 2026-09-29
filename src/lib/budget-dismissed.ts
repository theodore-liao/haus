// Budget rows the household dismissed on Overview. They stay hidden until the month ends.
// Stored as one JSON setting: {month:"YYYY-MM", ids:[category, ...]}.
import { prisma } from "./db";
import { ymKey } from "./range";

const KEY = "budgetDismissed";

export async function readBudgetDismissed(now = new Date()): Promise<string[]> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: KEY } });
    if (!row) return [];
    const parsed = JSON.parse(row.value) as { month?: string; ids?: unknown };
    if (parsed.month !== ymKey(now) || !Array.isArray(parsed.ids)) return [];
    return parsed.ids.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export async function dismissBudget(id: string, now = new Date()) {
  const ids = Array.from(new Set([...(await readBudgetDismissed(now)), id]));
  const value = JSON.stringify({ month: ymKey(now), ids });
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  return ids;
}
