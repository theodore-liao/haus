import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getTransactions } from "@/lib/queries";
import { getOwnerFilter } from "@/lib/request";
import { formatDate, formatMoney } from "@/lib/format";
import { categoryLabel } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireSession();
  const owner = await getOwnerFilter();
  const rows = await getTransactions(owner);
  const header = ["Date", "Merchant", "Account", "Owner", "Category", "Amount", "Pending"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        formatDate(r.date),
        csv(r.merchant),
        csv(r.account),
        csv(r.ownerLabel),
        csv(categoryLabel(r.category)),
        formatMoney(r.amount),
        r.pending ? "pending" : "",
      ].join(","),
    ),
  ];
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="haus-transactions.csv"',
    },
  });
}

function csv(v: string) {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replaceAll('"', '""')}"`;
  return v;
}
