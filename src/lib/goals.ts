// Goals tab settings, stored as one Setting row; no schema change.
import { prisma } from "./db";

/** Whether the Goals tab shows in the sidebar. On unless the household turned it off. */
export async function readShowGoals(): Promise<boolean> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: "showGoals" } });
    return row ? row.value !== "false" : true;
  } catch {
    return true;
  }
}

export async function writeShowGoals(on: boolean) {
  const value = on ? "true" : "false";
  await prisma.setting.upsert({ where: { key: "showGoals" }, create: { key: "showGoals", value }, update: { value } });
}
