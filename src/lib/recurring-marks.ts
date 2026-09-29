import { prisma } from "./db";
import type { Cadence, RecurringKind, RecurringMark } from "./recurring";

const KEY = "recurringMarks";
const KINDS = new Set<string>(["loan", "bill", "subscription"]);
const CADENCES = new Set<string>(["weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual"]);

function parse(value: unknown): RecurringMark | null {
  // Older saves held just the kind.
  if (typeof value === "string") return KINDS.has(value) ? { kind: value as RecurringKind } : null;
  if (!value || typeof value !== "object") return null;
  const v = value as { kind?: unknown; cadence?: unknown; off?: unknown };
  if (v.off === true) return { off: true };
  if (typeof v.kind !== "string" || !KINDS.has(v.kind)) return null;
  const cadence = typeof v.cadence === "string" && CADENCES.has(v.cadence) ? (v.cadence as Cadence) : undefined;
  return { kind: v.kind as RecurringKind, ...(cadence ? { cadence } : {}) };
}

/** What the household set for each merchant (by billKey): listed under a kind and cadence, or kept off the list. */
export async function readRecurringMarks(): Promise<Map<string, RecurringMark>> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: KEY } });
    const raw = row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
    const out = new Map<string, RecurringMark>();
    for (const [key, value] of Object.entries(raw)) {
      const mark = parse(value);
      if (mark) out.set(key, mark);
    }
    return out;
  } catch {
    return new Map();
  }
}

export async function writeRecurringMarks(marks: Map<string, RecurringMark>) {
  const value = JSON.stringify(Object.fromEntries(marks));
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}
