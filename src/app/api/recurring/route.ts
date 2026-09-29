import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recurringMerchantKey } from "@/lib/categories";
import { getReports } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { billKey } from "@/lib/recurring";
import { readRecurringMarks, writeRecurringMarks } from "@/lib/recurring-marks";

export const dynamic = "force-dynamic";

const schema = z.object({
  merchant: z.string().min(1),
  /** The kind and cadence to list it under, or null to keep it off the list. */
  kind: z.enum(["loan", "bill", "subscription"]).nullable(),
  cadence: z.enum(["weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual"]).optional(),
});

async function listed(merchant: string) {
  const reports = await getReports(await getOwnerFilter());
  const key = billKey(merchant);
  return reports.recurring.find((r) => billKey(r.label) === key) ?? null;
}

/** Whether a merchant is listed under Recurring now, and under which kind and cadence. */
export async function GET(req: Request) {
  await requireSession();
  const merchant = new URL(req.url).searchParams.get("merchant")?.trim();
  if (!merchant) return NextResponse.json({ error: "Merchant required." }, { status: 400 });
  const hit = await listed(merchant);
  return NextResponse.json({ kind: hit?.kind ?? null, cadence: hit?.cadence ?? null, manual: Boolean(hit?.manual) });
}

/** List a merchant under a kind and cadence, or take it off the list. */
export async function POST(req: Request) {
  await requireSession();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const { merchant, kind, cadence } = parsed.data;
  const key = billKey(merchant);
  const ruleKey = recurringMerchantKey(merchant);
  if (!key || !ruleKey) return NextResponse.json({ error: "Merchant required." }, { status: 400 });

  const marks = await readRecurringMarks();
  if (kind) {
    marks.set(key, { kind, ...(cadence ? { cadence } : {}) });
    // A merchant removed with the X earlier is wanted again.
    await prisma.merchantRule.updateMany({ where: { merchantKey: ruleKey, ignoreRecurring: true }, data: { ignoreRecurring: false } });
    await prisma.merchantRule.deleteMany({ where: { merchantKey: ruleKey, ignoreRecurring: false, hidden: false, category: null, displayName: null } });
  } else {
    // Unflagging takes it off the list for good. It is not a removal, so Restore removed never brings it back;
    // flagging it again does.
    marks.set(key, { off: true });
  }
  await writeRecurringMarks(marks);
  return NextResponse.json({ ok: true });
}
