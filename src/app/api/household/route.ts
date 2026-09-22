import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { clearCardPaymentCache } from "@/lib/card-payments";
import { ensureHousehold, prisma } from "@/lib/db";
import { ownerOptions } from "@/lib/owners";
import { syncAllItems } from "@/lib/plaid-sync";
import {
  backfillSavedTransactions,
  clearTransactionsStoredSince,
  markTransactionsStoredSince,
  readTransactionsStoredSince,
} from "@/lib/saved-txns";
import { readProjectionPrefs, writeProjectionPrefs } from "@/lib/projection-prefs";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireSession();
  const household = await ensureHousehold();
  const children = await prisma.child.findMany({ orderBy: { name: "asc" } });
  const projectionPrefs = await readProjectionPrefs();
  return NextResponse.json({
    nameA: household.nameA,
    nameB: household.nameB,
    birthdateA: household.birthdateA?.toISOString().slice(0, 10) ?? null,
    birthdateB: household.birthdateB?.toISOString().slice(0, 10) ?? null,
    quoteApiKeySet: Boolean(household.quoteApiKey),
    children,
    options: ownerOptions({ ...household, children }),
    projectionPrefs,
  });
}

// Birthdates arrive as "YYYY-MM-DD" (or null to clear) and are stored at UTC midnight.
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Invalid date")
  .nullable()
  .optional();

const projectionPrefsSchema = z
  .object({
    rate: z.number().finite().optional(),
    contribution: z.number().finite().optional(),
    retireAge: z.number().finite().optional(),
    yearsFallback: z.number().finite().optional(),
    holderKey: z.enum(["A", "B"]).optional(),
  })
  .strict();

const patchSchema = z.object({
  nameA: z.string().min(1).max(40).optional(),
  nameB: z.string().min(1).max(40).optional(),
  birthdateA: isoDay,
  birthdateB: isoDay,
  quoteApiKey: z.string().nullable().optional(),
  pairCardPayments: z.boolean().optional(),
  showCrypto: z.boolean().optional(),
  showRetirement: z.boolean().optional(),
  showProperty: z.boolean().optional(),
  showInsurance: z.boolean().optional(),
  showInsights: z.boolean().optional(),
  keepTransactions: z.boolean().optional(),
  projectionPrefs: projectionPrefsSchema.optional(),
});

function toDate(s: string | null | undefined) {
  if (s === undefined) return undefined;
  return s === null ? null : new Date(`${s}T00:00:00Z`);
}

export async function PATCH(req: Request) {
  await requireSession();
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  const previous = await ensureHousehold();
  const { birthdateA, birthdateB, projectionPrefs: projectionPatch, ...rest } = parsed.data;
  if (parsed.data.pairCardPayments !== undefined) clearCardPaymentCache();
  const hasHouseholdFields =
    Object.keys(rest).length > 0 || birthdateA !== undefined || birthdateB !== undefined;
  // projectionPrefs is stored via raw SQL (Prisma client may not know the column yet).
  const household = hasHouseholdFields
    ? await prisma.household.update({
        where: { id: "haus" },
        data: { ...rest, birthdateA: toDate(birthdateA), birthdateB: toDate(birthdateB) },
      })
    : previous;
  const projectionPrefs = projectionPatch ? await writeProjectionPrefs(projectionPatch) : await readProjectionPrefs();
  const turnedOn = parsed.data.keepTransactions === true && !previous.keepTransactions;
  const pairingChanged =
    parsed.data.pairCardPayments !== undefined && parsed.data.pairCardPayments !== previous.pairCardPayments;

  // Off→on: pull current bank history first, then upsert every posted live row.
  // Pairing changes only need a fresh snapshot of what is already on the ledger.
  let syncError: string | null = null;
  if (turnedOn) {
    try {
      const results = await syncAllItems();
      const messages = results
        .filter((r) => r.status === "error" || r.status === "relink" || (r.errors?.length ?? 0) > 0)
        .flatMap((r) => (r.errors?.length ? r.errors : [`Connection sync failed (${r.status}).`]));
      if (messages.length) syncError = messages.join(" · ");
    } catch {
      syncError = "Could not sync connections.";
    }
  }

  if (turnedOn || (pairingChanged && household.keepTransactions)) {
    try {
      await backfillSavedTransactions();
    } catch {
      if (turnedOn) {
        await prisma.household.update({ where: { id: "haus" }, data: { keepTransactions: false } });
        await clearTransactionsStoredSince();
      }
      return NextResponse.json({ error: "Could not copy transactions." }, { status: 500 });
    }
  }

  const transactionsStoredSince = turnedOn ? await markTransactionsStoredSince() : await readTransactionsStoredSince();

  // Keep stays on when the copy succeeded, even if one institution failed to sync.
  return NextResponse.json({
    ok: true,
    household,
    transactionsStoredSince,
    projectionPrefs,
    ...(syncError ? { syncError } : {}),
  });
}
